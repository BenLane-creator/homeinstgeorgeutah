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
  provider: "Washington County BOR - IDX",
  source: "Spark® / RESO Web API",
  compliance: [
    "Display only MLS fields approved by IDX/Web API agreement.",
    "Do not scrape, cache, or copy MLS content outside permitted API rules.",
    "Listing availability, attribution, update timestamps, and disclaimers must be handled before production launch.",
  ],
};

function json(payload: ApiResponse, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
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
    "page",
    "limit",
  ]);

  const params: Record<string, string> = {};

  for (const [key, value] of url.searchParams.entries()) {
    if (allowed.has(key)) {
      params[key] = value.trim();
    }
  }

  const limit = Math.min(Math.max(Number(params.limit || 12), 1), 50);
  const page = Math.max(Number(params.page || 1), 1);

  return {
    ...params,
    limit: String(limit),
    page: String(page),
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

  const liveResult = await callSparkReso(env, "/Property", params).catch(
    (error) => ({
      sparkError:
        error instanceof Error ? error.message : "Unknown Spark/RESO error",
    }),
  );

  if (!liveResult) {
    return json({
      ok: true,
      data: {
        mode: "stub",
        message:
          "MLS search endpoint is wired, but Spark® / RESO credentials are not configured yet.",
        query: params,
        results: [],
      },
      meta: {
        ...providerMeta,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  return json({
    ok: true,
    data: {
      mode: "live",
      query: params,
      result: liveResult as JsonValue,
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

  const liveResult = await callSparkReso(
    env,
    `/Property('${encodeURIComponent(listingId)}')`,
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
          "Listing detail endpoint is wired, but Spark® / RESO credentials are not configured yet.",
        listingId,
        listing: null,
      },
      meta: {
        ...providerMeta,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  return json({
    ok: true,
    data: {
      mode: "live",
      listingId,
      result: liveResult as JsonValue,
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
