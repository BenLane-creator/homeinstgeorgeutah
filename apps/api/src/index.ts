import { createSparkResoProvider } from "./providers/spark-reso-provider";
import { parseSearchInput } from "./search/validate-search";

export interface Env {
  DB?: D1Database;
  SPARK_API_BASE_URL?: string;
  SPARK_ACCESS_TOKEN?: string;
  MLS_PROVIDER_NAME?: string;
  API_WRITE_ORIGINS?: string;
  TURNSTILE_SECRET_KEY?: string;
  LEADS_KV?: KVNamespace;
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

type WorkflowLane =
  | "seller_high_priority"
  | "valuation"
  | "buyer_active_search"
  | "buyer_early_stage"
  | "relocation"
  | "property_inquiry"
  | "showing_request"
  | "general_contact"
  | "booked_consult"
  | "nurture";

type LeadInput = {
  intent: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  pageUrl: string;
  sourcePath: string;
  listingId: string;
  consent: boolean;
  attributionSessionId: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  deviceCategory: string;
  screenWidth: string;
  screenHeight: string;
  userAgent: string;
};

type StoredLead = {
  id: string;
  contactId: string;
  routingDecisionId: string;
  attributionSessionId: string;
  workflowLane: WorkflowLane;
  createdAt: string;
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

const defaultAllowedOrigins = [
  "https://homeinstgeorgeutah.com",
  "https://www.homeinstgeorgeutah.com",
  "https://benlane.us",
  "http://localhost:4321",
  "http://localhost:8787",
];

function allowedOrigins(env: Env) {
  const configured = env.API_WRITE_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  return new Set([...defaultAllowedOrigins, ...configured]);
}

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin = allowedOrigins(env).has(origin) ? origin : "https://homeinstgeorgeutah.com";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,cf-turnstile-response",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(request: Request, env: Env, payload: ApiResponse, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(request, env),
      ...init.headers,
    },
  });
}

function withMeta(payload: Omit<ApiResponse, "meta">): ApiResponse {
  return {
    ...payload,
    meta: {
      ...providerMeta,
      generatedAt: new Date().toISOString(),
    },
  };
}

function notFound(request: Request, env: Env, pathname: string) {
  return json(
    request,
    env,
    withMeta({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: `No API route exists for ${pathname}`,
      },
    }),
    { status: 404 },
  );
}

function badRequest(request: Request, env: Env, message: string) {
  return json(
    request,
    env,
    withMeta({
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message,
      },
    }),
    { status: 400 },
  );
}

function upstreamError(request: Request, env: Env, message: string) {
  return json(
    request,
    env,
    withMeta({
      ok: false,
      error: {
        code: "UPSTREAM_MLS_ERROR",
        message,
      },
    }),
    { status: 502 },
  );
}

function methodNotAllowed(request: Request, env: Env, message: string) {
  return json(
    request,
    env,
    withMeta({
      ok: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message,
      },
    }),
    { status: 405 },
  );
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function safePathname(pageUrl: string, fallbackOrigin: string) {
  if (!pageUrl) return "";

  try {
    return new URL(pageUrl, fallbackOrigin).pathname;
  } catch {
    return "";
  }
}

function classifyWorkflowLane(input: Pick<LeadInput, "intent" | "listingId" | "message" | "pageUrl">): WorkflowLane {
  const haystack = `${input.intent} ${input.message} ${input.pageUrl}`.toLowerCase();

  if (haystack.includes("showing") || haystack.includes("tour")) return "showing_request";
  if (haystack.includes("valuation") || haystack.includes("value") || haystack.includes("sell my home")) return "valuation";
  if (haystack.includes("seller") || haystack.includes("listing appointment")) return "seller_high_priority";
  if (haystack.includes("relocation") || haystack.includes("moving to")) return "relocation";
  if (haystack.includes("book") || haystack.includes("appointment") || haystack.includes("consult")) return "booked_consult";
  if (input.listingId || haystack.includes("property")) return "property_inquiry";
  if (haystack.includes("buyer") || haystack.includes("search") || haystack.includes("home")) return "buyer_active_search";

  return "general_contact";
}

function normalizeLeadInput(body: Record<string, unknown>, request: Request): LeadInput {
  const url = new URL(request.url);
  const pageUrl = String(body.pageUrl || body.sourcePath || "").trim();
  const referrer = String(body.referrer || request.headers.get("referer") || "").trim();
  const attribution = typeof body.attribution === "object" && body.attribution !== null ? body.attribution as Record<string, unknown> : {};
  const device = typeof body.device === "object" && body.device !== null ? body.device as Record<string, unknown> : {};

  return {
    intent: String(body.intent || "general_contact").trim(),
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    phone: normalizePhone(String(body.phone || "").trim()),
    message: String(body.message || "").trim(),
    pageUrl,
    sourcePath: safePathname(pageUrl, url.origin),
    listingId: String(body.listingId || body.propertyId || "").trim(),
    consent: body.consent === true || body.consent === "true" || body.consent === "on",
    attributionSessionId: String(body.attributionSessionId || attribution.sessionId || crypto.randomUUID()).trim(),
    referrer: String(attribution.referrer || referrer).trim(),
    utmSource: String(attribution.utmSource || body.utmSource || "").trim(),
    utmMedium: String(attribution.utmMedium || body.utmMedium || "").trim(),
    utmCampaign: String(attribution.utmCampaign || body.utmCampaign || "").trim(),
    deviceCategory: String(device.category || body.deviceCategory || "unknown").trim(),
    screenWidth: String(device.screenWidth || body.screenWidth || "").trim(),
    screenHeight: String(device.screenHeight || body.screenHeight || "").trim(),
    userAgent: request.headers.get("user-agent") ?? "",
  };
}

async function handleHealth(request: Request, env: Env) {
  return json(
    request,
    env,
    withMeta({
      ok: true,
      data: {
        service: "homeinstgeorgeutah-api",
        status: "ok",
        routes: [
          "/api/search",
          "/api/listings/:id",
          "/api/leads",
          "/api/v1/leads/intake",
          "/api/v1/valuation/request",
          "/api/v1/properties/inquiry",
          "/api/v1/properties/showing",
          "/api/v1/search/execute",
          "/api/v1/search/map",
          "/api/v1/search/save",
          "/api/v1/homes/save",
          "/api/v1/homes/unsave",
          "/api/v1/alerts/subscribe",
          "/api/v1/auth/register",
          "/api/v1/auth/login",
          "/api/v1/vow/register",
          "/api/v1/vow/accept-terms",
          "/api/v1/bookings/create-handoff",
          "/api/v1/crm/sync",
          "/api/v1/idx/events",
          "/api/v1/reports/market/:geo",
        ],
      },
    }),
  );
}

async function handleSearch(request: Request, env: Env) {
  const url = new URL(request.url);
  const input = parseSearchInput(url);
  const provider = createSparkResoProvider(env);

  try {
    const result = await provider.search(input);

    return json(
      request,
      env,
      withMeta({
        ok: true,
        data: {
          mode: result.source,
          query: input as unknown as JsonValue,
          listings: result.results as unknown as JsonValue,
          pagination: {
            page: result.page,
            limit: result.limit,
            count: result.count ?? result.results.length,
          },
          warnings: result.warnings,
        },
      }),
      {
        headers: {
          "cache-control": result.source === "live" ? "private, max-age=60" : "no-store",
        },
      },
    );
  } catch (error) {
    return upstreamError(request, env, error instanceof Error ? error.message : "Unknown Spark/RESO error");
  }
}

async function handleListingDetail(request: Request, env: Env, listingId: string) {
  if (!listingId) {
    return badRequest(request, env, "Missing listing id.");
  }

  const provider = createSparkResoProvider(env);

  try {
    const listing = await provider.getById(listingId);

    return json(
      request,
      env,
      withMeta({
        ok: true,
        data: {
          mode: listing ? "live" : "stub",
          listingId,
          listing: listing as unknown as JsonValue,
          warnings: [
            "Listing detail output is normalized and provisional until exact MLS display requirements are confirmed.",
          ],
        },
      }),
      {
        headers: {
          "cache-control": listing ? "private, max-age=60" : "no-store",
        },
      },
    );
  } catch (error) {
    return upstreamError(request, env, error instanceof Error ? error.message : "Unknown Spark/RESO error");
  }
}

async function verifyTurnstile(request: Request, env: Env, body: Record<string, unknown>) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return true;
  }

  const token = String(body.turnstileToken || request.headers.get("cf-turnstile-response") || "").trim();

  if (!token) {
    return false;
  }

  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  formData.append("remoteip", request.headers.get("cf-connecting-ip") ?? "");

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  const result = await response.json() as { success?: boolean };
  return result.success === true;
}

async function persistLead(env: Env, input: LeadInput, workflowLane: WorkflowLane): Promise<StoredLead | null> {
  if (!env.DB) {
    return null;
  }

  const now = new Date().toISOString();
  const contactId = crypto.randomUUID();
  const leadEventId = crypto.randomUUID();
  const routingDecisionId = crypto.randomUUID();
  const propertyContextId = input.listingId ? crypto.randomUUID() : null;
  const { firstName, lastName } = splitName(input.name);

  const existing = await env.DB.prepare(
    "select id from contacts where email_normalized = ?1 or (phone_normalized != '' and phone_normalized = ?2) limit 1",
  ).bind(input.email, input.phone).first<{ id: string }>();

  const finalContactId = existing?.id ?? contactId;

  if (existing?.id) {
    await env.DB.prepare(
      "update contacts set full_name = ?1, first_name = ?2, last_name = ?3, phone = ?4, phone_normalized = ?5, updated_at = ?6 where id = ?7",
    ).bind(input.name, firstName, lastName, input.phone, input.phone, now, finalContactId).run();
  } else {
    await env.DB.prepare(
      `insert into contacts (id, full_name, first_name, last_name, email, email_normalized, phone, phone_normalized, source, created_at, updated_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'website', ?9, ?9)`,
    ).bind(finalContactId, input.name, firstName, lastName, input.email, input.email, input.phone, input.phone, now).run();
  }

  await env.DB.prepare(
    `insert or ignore into attribution_sessions
      (id, contact_id, landing_page_url, referrer, utm_source, utm_medium, utm_campaign, device_category, screen_width, screen_height, user_agent, created_at, updated_at)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)`,
  ).bind(
    input.attributionSessionId,
    finalContactId,
    input.pageUrl,
    input.referrer,
    input.utmSource,
    input.utmMedium,
    input.utmCampaign,
    input.deviceCategory,
    input.screenWidth,
    input.screenHeight,
    input.userAgent,
    now,
  ).run();

  if (propertyContextId) {
    await env.DB.prepare(
      `insert into property_context (id, listing_id, page_url, source, created_at)
       values (?1, ?2, ?3, 'lead_intake', ?4)`,
    ).bind(propertyContextId, input.listingId, input.pageUrl, now).run();
  }

  await env.DB.prepare(
    `insert into lead_events
      (id, contact_id, attribution_session_id, property_context_id, event_type, intent_type, workflow_lane, message, page_url, consent, payload_json, created_at)
     values (?1, ?2, ?3, ?4, 'lead_intake', ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  ).bind(
    leadEventId,
    finalContactId,
    input.attributionSessionId,
    propertyContextId,
    input.intent,
    workflowLane,
    input.message,
    input.pageUrl,
    input.consent ? 1 : 0,
    JSON.stringify(input),
    now,
  ).run();

  await env.DB.prepare(
    `insert into routing_decisions
      (id, contact_id, lead_event_id, workflow_lane, reason, assigned_to, status, created_at)
     values (?1, ?2, ?3, ?4, ?5, 'joel', 'new', ?6)`,
  ).bind(
    routingDecisionId,
    finalContactId,
    leadEventId,
    workflowLane,
    `Classified from intent=${input.intent || "general_contact"}`,
    now,
  ).run();

  return {
    id: leadEventId,
    contactId: finalContactId,
    routingDecisionId,
    attributionSessionId: input.attributionSessionId,
    workflowLane,
    createdAt: now,
  };
}

async function handleLead(request: Request, env: Env) {
  if (request.method !== "POST") {
    return methodNotAllowed(request, env, "Use POST for lead intake.");
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return badRequest(request, env, "Invalid JSON body.");
  }

  const turnstileOk = await verifyTurnstile(request, env, body);

  if (!turnstileOk) {
    return badRequest(request, env, "Security check failed. Refresh the page and try again.");
  }

  const input = normalizeLeadInput(body, request);

  if (!input.name || !input.email) {
    return badRequest(request, env, "Name and email are required.");
  }

  if (!validateEmail(input.email)) {
    return badRequest(request, env, "A valid email is required.");
  }

  if (!input.consent) {
    return badRequest(request, env, "Consent is required before submitting a real estate request.");
  }

  const workflowLane = classifyWorkflowLane(input);
  let persisted: StoredLead | null = null;
  let persistenceError = "";

  try {
    persisted = await persistLead(env, input, workflowLane);
  } catch (error) {
    persistenceError = error instanceof Error ? error.message : "Unknown D1 persistence error";
  }

  const fallbackLead = {
    id: crypto.randomUUID(),
    ...input,
    workflowLane,
    createdAt: new Date().toISOString(),
  };

  if (!persisted && env.LEADS_KV) {
    await env.LEADS_KV.put(`lead:${fallbackLead.id}`, JSON.stringify(fallbackLead));
  }

  return json(
    request,
    env,
    withMeta({
      ok: true,
      data: {
        mode: persisted ? "d1" : env.LEADS_KV ? "kv" : "stub",
        message: persisted
          ? "Lead captured in the owned D1 lead engine."
          : env.LEADS_KV
            ? "Lead captured in fallback KV storage. Bind D1 for the production source of truth."
            : "Lead endpoint is wired. Bind D1 before production.",
        lead: persisted ?? fallbackLead,
        persistenceError,
      },
    }),
    { status: 201 },
  );
}

async function handleSaveStub(request: Request, env: Env, action: string) {
  if (request.method !== "POST") {
    return methodNotAllowed(request, env, `Use POST for ${action}.`);
  }

  return json(
    request,
    env,
    withMeta({
      ok: true,
      data: {
        mode: "planned",
        action,
        message: "This high-intent action is routed through the API first. Connect user accounts and D1 product tables before enabling production saves/alerts.",
      },
    }),
    { status: 202 },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return json(request, env, { ok: true, meta: { generatedAt: new Date().toISOString() } });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, "") || "/";

    if (pathname === "/" || pathname === "/api" || pathname === "/api/health" || pathname === "/api/v1/health") {
      return handleHealth(request, env);
    }

    if (pathname === "/api/search" || pathname === "/api/v1/search/execute" || pathname === "/api/v1/search/map") {
      return handleSearch(request, env);
    }

    const listingMatch = pathname.match(/^\/api\/(?:v1\/)?listings\/([^/]+)$/);
    if (listingMatch) {
      const listingId = decodeURIComponent(listingMatch[1] ?? "");
      return handleListingDetail(request, env, listingId);
    }

    if (
      pathname === "/api/leads" ||
      pathname === "/api/v1/leads/intake" ||
      pathname === "/api/v1/valuation/request" ||
      pathname === "/api/v1/properties/inquiry" ||
      pathname === "/api/v1/properties/showing"
    ) {
      return handleLead(request, env);
    }

    if (pathname === "/api/v1/search/save") return handleSaveStub(request, env, "save_search");
    if (pathname === "/api/v1/homes/save") return handleSaveStub(request, env, "save_home");
    if (pathname === "/api/v1/homes/unsave") return handleSaveStub(request, env, "unsave_home");
    if (pathname === "/api/v1/alerts/subscribe") return handleSaveStub(request, env, "subscribe_alert");
    if (pathname === "/api/v1/auth/register") return handleSaveStub(request, env, "auth_register");
    if (pathname === "/api/v1/auth/login") return handleSaveStub(request, env, "auth_login");
    if (pathname === "/api/v1/vow/register") return handleSaveStub(request, env, "vow_register");
    if (pathname === "/api/v1/vow/accept-terms") return handleSaveStub(request, env, "vow_accept_terms");
    if (pathname === "/api/v1/bookings/create-handoff") return handleSaveStub(request, env, "booking_handoff");
    if (pathname === "/api/v1/crm/sync") return handleSaveStub(request, env, "crm_sync");
    if (pathname === "/api/v1/idx/events") return handleSaveStub(request, env, "idx_event");

    const marketReportMatch = pathname.match(/^\/api\/v1\/reports\/market\/([^/]+)$/);
    if (marketReportMatch) {
      return handleSaveStub(request, env, "market_report");
    }

    if (pathname === "/api/mls-status" || pathname === "/api/v1/mls-status") {
      return json(
        request,
        env,
        withMeta({
          ok: true,
          data: {
            configured: Boolean(env.SPARK_API_BASE_URL && env.SPARK_ACCESS_TOKEN),
            d1Bound: Boolean(env.DB),
            turnstileConfigured: Boolean(env.TURNSTILE_SECRET_KEY),
            requiredEnv: ["SPARK_API_BASE_URL", "SPARK_ACCESS_TOKEN"],
            optionalEnv: ["MLS_PROVIDER_NAME"],
            requiredBindings: ["DB"],
            optionalBindings: ["LEADS_KV"],
          },
        }),
      );
    }

    return notFound(request, env, url.pathname);
  },
};
