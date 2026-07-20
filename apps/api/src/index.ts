import { asString, hasConsent, storeLeadIntake } from "./services/lead-service";

export interface Env {
  SPARK_API_BASE_URL?: string;
  SPARK_ACCESS_TOKEN?: string;
  API_WRITE_ORIGINS?: string;
  TURNSTILE_SECRET_KEY?: string;
  DB: D1Database;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ApiResponse = {
  ok: boolean;
  data?: JsonValue;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    provider?: string;
    source?: string;
    compliance?: string[];
    generatedAt: string;
  };
};

const providerMeta = {
  provider: "Washington + Iron MLS via approved Spark/Flexmls/FBS access",
  source: "Spark® / RESO Web API",
  compliance: [
    "Display only MLS fields approved by IDX/VOW/Web API agreements.",
    "Do not expose raw MLS payloads to the browser.",
    "Listing availability, attribution, update timestamps, media rights, public/registered/VOW gates, and disclaimers must be enforced before production launch.",
  ],
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function firstString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function firstNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === "") continue;
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function primaryMediaUrl(record: UnknownRecord) {
  const direct = firstString(record, [
    "PrimaryPhotoUrl",
    "PrimaryPhotoURL",
    "PhotoUrl",
    "PhotoURL",
  ]);
  if (direct) return direct;

  for (const collection of [record.Media, record.Photos, record.Images]) {
    if (!Array.isArray(collection)) continue;

    for (const item of collection) {
      const media = asRecord(item);
      if (!media) continue;
      const url = firstString(media, [
        "MediaURL",
        "MediaUrl",
        "Uri",
        "URL",
        "Url",
      ]);
      if (url) return url;
    }
  }

  return null;
}

function listingCandidates(payload: unknown) {
  const root = asRecord(payload);
  const nestedD = root ? asRecord(root.d) : null;

  if (root && Array.isArray(root.value)) return root.value;
  if (root && Array.isArray(root.results)) return root.results;
  if (nestedD && Array.isArray(nestedD.results)) return nestedD.results;
  if (nestedD) return [nestedD];
  if (root) return [root];

  return [];
}

function normalizeSparkListings(payload: unknown) {
  return listingCandidates(payload)
    .map((item, index) => {
      const listing = asRecord(item);
      if (!listing) return null;

      const listingId =
        firstString(listing, [
          "ListingKey",
          "ListingId",
          "ListingID",
          "Matrix_Unique_ID",
        ]) || `result-${index + 1}`;

      return {
        listingId,
        status: firstString(listing, ["StandardStatus", "MlsStatus", "Status"]),
        price: firstNumber(listing, ["ListPrice", "CurrentPrice", "Price"]),
        propertyType: firstString(listing, ["PropertyType"]),
        propertySubType: firstString(listing, [
          "PropertySubType",
          "PropertySubTypeText",
        ]),
        addressDisplay:
          firstString(listing, [
            "UnparsedAddress",
            "StreetAddress",
            "Address",
          ]) || "Address available through MLS",
        city: firstString(listing, ["City"]),
        state: firstString(listing, ["StateOrProvince", "State"]),
        postalCode: firstString(listing, ["PostalCode", "ZipCode"]),
        beds: firstNumber(listing, ["BedroomsTotal", "BedsTotal", "Bedrooms"]),
        baths: firstNumber(listing, [
          "BathroomsTotalInteger",
          "BathroomsFull",
          "BathsTotal",
          "Bathrooms",
        ]),
        livingArea: firstNumber(listing, [
          "LivingArea",
          "BuildingAreaTotal",
          "SquareFeet",
        ]),
        lotSizeAcres: firstNumber(listing, ["LotSizeAcres"]),
        primaryPhotoUrl: primaryMediaUrl(listing),
        attribution:
          firstString(listing, [
            "ListOfficeName",
            "ListingOfficeName",
            "BuyerOfficeName",
          ]) || providerMeta.provider,
        updatedAt: firstString(listing, [
          "ModificationTimestamp",
          "PhotosChangeTimestamp",
          "StatusChangeTimestamp",
        ]),
        requiredDisclaimers: providerMeta.compliance,
      };
    })
    .filter((listing) => listing !== null);
}

function json(payload: ApiResponse, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function notFound(pathname: string) {
  return json(
    {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: `No API route exists for ${pathname}`,
      },
      meta: {
        ...providerMeta,
        generatedAt: new Date().toISOString(),
      },
    },
    { status: 404 },
  );
}

function badRequest(message: string) {
  return json(
    {
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message,
      },
      meta: {
        ...providerMeta,
        generatedAt: new Date().toISOString(),
      },
    },
    { status: 400 },
  );
}

function _serviceNotConfigured() {
  return json(
    {
      ok: false,
      error: {
        code: "MLS_NOT_CONFIGURED",
        message:
          "Spark® / RESO Web API credentials are not configured yet. Add SPARK_API_BASE_URL and SPARK_ACCESS_TOKEN before enabling live MLS results.",
      },
      meta: {
        ...providerMeta,
        generatedAt: new Date().toISOString(),
      },
    },
    { status: 501 },
  );
}

function sanitizeSearchParams(url: URL) {
  const allowed = new Set([
    "q",
    "city",
    "neighborhood",
    "minPrice",
    "maxPrice",
    "beds",
    "baths",
    "propertyType",
    "status",
    "sort",
    "page",
    "limit",
  ]);

  const params: Record<string, string> = {};

  for (const [key, value] of url.searchParams.entries()) {
    if (allowed.has(key)) {
      params[key] = value.trim();
    }
  }

  const limit = Math.min(Math.max(Number(params.limit || 12), 1), 25);
  const page = Math.max(Number(params.page || 1), 1);

  params.limit = String(limit);
  params.page = String(page);

  return params;
}

type SearchParams = ReturnType<typeof sanitizeSearchParams>;

function escapeODataString(value: string) {
  return value.replace(/'/g, "''");
}

function validSearchNumber(value: string | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildProviderSearchParams(params: SearchParams) {
  const filters: string[] = [];
  const status = params.status || "Active";

  filters.push(`StandardStatus eq '${escapeODataString(status)}'`);

  if (params.city) {
    filters.push(`City eq '${escapeODataString(params.city)}'`);
  }

  if (params.neighborhood) {
    filters.push(
      `contains(SubdivisionName,'${escapeODataString(params.neighborhood)}')`,
    );
  }

  if (params.propertyType) {
    filters.push(
      `PropertyType eq '${escapeODataString(params.propertyType)}'`,
    );
  }

  if (params.q) {
    const query = escapeODataString(params.q);
    filters.push(
      `(contains(UnparsedAddress,'${query}') or contains(City,'${query}') or contains(SubdivisionName,'${query}') or ListingId eq '${query}')`,
    );
  }

  const minPrice = validSearchNumber(params.minPrice);
  const maxPrice = validSearchNumber(params.maxPrice);
  const beds = validSearchNumber(params.beds);
  const baths = validSearchNumber(params.baths);

  if (minPrice !== null) filters.push(`ListPrice ge ${minPrice}`);
  if (maxPrice !== null) filters.push(`ListPrice le ${maxPrice}`);
  if (beds !== null) filters.push(`BedroomsTotal ge ${beds}`);
  if (baths !== null) {
    filters.push(`BathroomsTotalInteger ge ${baths}`);
  }

  const page = Number(params.page);
  const limit = Number(params.limit);

  return {
    "$top": String(limit),
    "$skip": String((page - 1) * limit),
    "$count": "true",
    "$orderby": "ModificationTimestamp desc",
    "$filter": filters.join(" and "),
    "$select": [
      "ListingKey",
      "ListingId",
      "StandardStatus",
      "ListPrice",
      "PropertyType",
      "PropertySubType",
      "UnparsedAddress",
      "City",
      "StateOrProvince",
      "PostalCode",
      "BedroomsTotal",
      "BathroomsTotalInteger",
      "LivingArea",
      "LotSizeAcres",
      "ListOfficeName",
      "ModificationTimestamp",
    ].join(","),
    "$expand": "Media($top=1)",
  };
}

async function callSparkReso(
  env: Env,
  path: string,
  params?: Record<string, string>,
) {
  if (!env.SPARK_API_BASE_URL || !env.SPARK_ACCESS_TOKEN) {
    return null;
  }

  const base = env.SPARK_API_BASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${env.SPARK_ACCESS_TOKEN}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Spark/RESO request failed with ${response.status}`);
  }

  return response.json();
}

async function handleHealth() {
  return json({
    ok: true,
    data: {
      service: "homeinstgeorgeutah-api",
      status: "ok",
      routes: [
        "/api/search",
        "/api/listings/:id",
        "/api/leads",
        "/api/v1/leads/intake",
      ],
    },
    meta: {
      ...providerMeta,
      generatedAt: new Date().toISOString(),
    },
  });
}

async function handleSearch(request: Request, env: Env) {
  const url = new URL(request.url);
  const params = sanitizeSearchParams(url);

  const providerParams = buildProviderSearchParams(params);

  const liveResult = await callSparkReso(
    env,
    "/Property",
    providerParams,
  ).catch((error) => ({
    sparkError:
      error instanceof Error ? error.message : "Unknown Spark/RESO error",
  }));

  if (!liveResult) {
    return json({
      ok: true,
      data: {
        mode: "stub",
        message:
          "Live listings are being prepared. Contact Joel for current availability.",
        query: params,
        listings: [],
        warnings: [],
        pagination: {
          page: Number(params.page),
          limit: Number(params.limit),
          count: 0,
        },
      },
      meta: {
        ...providerMeta,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  const upstreamError = asRecord(liveResult)?.sparkError;

  if (typeof upstreamError === "string") {
    return json(
      {
        ok: false,
        error: {
          code: "MLS_UPSTREAM_ERROR",
          message:
            "Live listings are temporarily unavailable. Please try again or contact Joel directly.",
        },
        meta: {
          ...providerMeta,
          generatedAt: new Date().toISOString(),
        },
      },
      { status: 502 },
    );
  }

  const listings = normalizeSparkListings(liveResult);
  const resultRecord = asRecord(liveResult);
  const total =
    (resultRecord && firstNumber(resultRecord, ["@odata.count"])) ??
    listings.length;

  return json({
    ok: true,
    data: {
      mode: "live",
      query: params,
      listings,
      warnings: [],
      pagination: {
        page: Number(params.page),
        limit: Number(params.limit),
        count: listings.length,
        total,
      },
    },
    meta: {
      ...providerMeta,
      generatedAt: new Date().toISOString(),
    },
  });
}

async function handleListingDetail(
  _request: Request,
  env: Env,
  listingId: string,
) {
  if (!listingId) {
    return badRequest("Missing listing id.");
  }

  const listingKey = escapeODataString(listingId);
  const liveResult = await callSparkReso(
    env,
    `/Property('${listingKey}')`,
    { "$expand": "Media($top=1)" },
  ).catch((error) => ({
    sparkError:
      error instanceof Error ? error.message : "Unknown Spark/RESO error",
  }));

  if (!liveResult) {
    return json({
      ok: true,
      data: {
        mode: "stub",
        message:
          "Property details are being prepared. Contact Joel for current information.",
        listingId,
        listing: null,
      },
      meta: {
        ...providerMeta,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  const upstreamError = asRecord(liveResult)?.sparkError;

  if (typeof upstreamError === "string") {
    return json(
      {
        ok: false,
        error: {
          code: "MLS_UPSTREAM_ERROR",
          message:
            "Property details are temporarily unavailable. Please try again or contact Joel directly.",
        },
        meta: {
          ...providerMeta,
          generatedAt: new Date().toISOString(),
        },
      },
      { status: 502 },
    );
  }

  const [listing = null] = normalizeSparkListings(liveResult);

  return json({
    ok: true,
    data: {
      mode: "live",
      listingId,
      listing,
    },
    meta: {
      ...providerMeta,
      generatedAt: new Date().toISOString(),
    },
  });
}

function parseAllowedOrigins(env: Env) {
  return (env.API_WRITE_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveWriteOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  const allowedOrigins = parseAllowedOrigins(env);

  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  return allowedOrigins[0] || "https://homeinstgeorgeutah.com";
}

function withWriteResponseHeaders(
  request: Request,
  env: Env,
  response: Response,
) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", resolveWriteOrigin(request, env));
  headers.set("access-control-allow-headers", "content-type,authorization");
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("cache-control", "no-store");
  headers.append("vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isLikelyAutomatedSubmission(request: Request) {
  const userAgent = request.headers.get("user-agent") || "";

  return !userAgent || userAgent.length < 8;
}

function writePreflightResponse(request: Request, env: Env) {
  return withWriteResponseHeaders(
    request,
    env,
    new Response(null, {
      status: 204,
    }),
  );
}

async function verifyTurnstileIfConfigured(
  request: Request,
  env: Env,
  body: Record<string, unknown>,
) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return true;
  }

  const token =
    asString(body.turnstileToken) || asString(body["cf-turnstile-response"]);

  if (!token) {
    return false;
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: getClientIp(request),
      }),
    },
  );

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as { success?: boolean };

  return result.success === true;
}

function rateLimitPlaceholderAllows(_request: Request, _env: Env) {
  return true;
}

async function handleLead(request: Request, env: Env) {
  if (request.method === "OPTIONS") {
    return writePreflightResponse(request, env);
  }

  if (request.method !== "POST") {
    return json(
      {
        ok: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Use POST for /api/leads or /api/v1/leads/intake.",
        },
        meta: {
          ...providerMeta,
          generatedAt: new Date().toISOString(),
        },
      },
      { status: 405 },
    );
  }

  if (!rateLimitPlaceholderAllows(request, env)) {
    return json(
      {
        ok: false,
        error: {
          code: "rate_limited",
          message: "Too many requests.",
        },
      },
      {
        status: 429,
      },
    );
  }

  if (isLikelyAutomatedSubmission(request)) {
    return json(
      {
        ok: false,
        error: {
          code: "invalid_request",
          message: "A valid user agent is required.",
        },
      },
      {
        status: 400,
      },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const turnstileVerified = await verifyTurnstileIfConfigured(
    request,
    env,
    body,
  );

  if (!turnstileVerified) {
    return badRequest("Bot protection verification failed.");
  }

  const url = new URL(request.url);
  const name = asString(body.name);
  const email = asString(body.email);
  const consent = hasConsent(body.consent);

  if (!name || !email) {
    return badRequest("Name and email are required.");
  }

  if (!email.includes("@")) {
    return badRequest("A valid email is required.");
  }

  if (!consent) {
    return badRequest("Consent is required.");
  }

  const storedLead = await storeLeadIntake(env, {
    body,
    requestUrl: request.url,
    pathname: url.pathname,
    referrer: request.headers.get("referer"),
    userAgent: request.headers.get("user-agent"),
  });

  return json(
    {
      ok: true,
      data: {
        mode: "stored",
        message: "Lead captured and stored in D1.",
        ...storedLead,
      },
      meta: {
        ...providerMeta,
        generatedAt: new Date().toISOString(),
      },
    },
    { status: 201 },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, "") || "/";

    if (
      request.method === "OPTIONS" &&
      (pathname === "/api/leads" || pathname === "/api/v1/leads/intake")
    ) {
      return withWriteResponseHeaders(
        request,
        env,
        await handleLead(request, env),
      );
    }

    if (request.method === "OPTIONS") {
      return json({
        ok: true,
        meta: { generatedAt: new Date().toISOString() },
      });
    }

    if (pathname === "/" || pathname === "/api" || pathname === "/api/health") {
      return handleHealth();
    }

    if (pathname === "/api/search") {
      return handleSearch(request, env);
    }

    if (pathname.startsWith("/api/listings/")) {
      const listingId = decodeURIComponent(
        pathname.replace("/api/listings/", ""),
      );
      return handleListingDetail(request, env, listingId);
    }

    if (pathname === "/api/leads" || pathname === "/api/v1/leads/intake") {
      return withWriteResponseHeaders(
        request,
        env,
        await handleLead(request, env),
      );
    }

    if (pathname === "/api/mls-status") {
      return json({
        ok: true,
        data: {
          configured: Boolean(env.SPARK_API_BASE_URL && env.SPARK_ACCESS_TOKEN),
          requiredEnv: ["SPARK_API_BASE_URL", "SPARK_ACCESS_TOKEN"],
          requiredBindings: ["DB"],
          optionalBindings: [],
        },
        meta: {
          ...providerMeta,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    return notFound(url.pathname);
  },
};
