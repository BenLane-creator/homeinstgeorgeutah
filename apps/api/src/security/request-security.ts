export interface LeadSecurityEnv {
  APP_ENV?: string;
  API_WRITE_ORIGINS?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_HOSTNAMES?: string;
  TURNSTILE_EXPECTED_ACTION?: string;
  LEAD_RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}

export class RequestSecurityError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 24_576;
const DEFAULT_TURNSTILE_ACTION = "turnstile-spin-v2";

export function parseAllowedOrigins(env: LeadSecurityEnv) {
  return (env.API_WRITE_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function approvedWriteOrigin(request: Request, env: LeadSecurityEnv) {
  const origin = request.headers.get("origin");
  return origin && parseAllowedOrigins(env).includes(origin) ? origin : null;
}

export function requireApprovedWriteOrigin(
  request: Request,
  env: LeadSecurityEnv,
) {
  const origin = approvedWriteOrigin(request, env);
  if (!origin) {
    throw new RequestSecurityError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "This request origin is not allowed.",
    );
  }
  return origin;
}

export function addWriteResponseHeaders(
  request: Request,
  env: LeadSecurityEnv,
  response: Response,
) {
  const headers = new Headers(response.headers);
  const origin = approvedWriteOrigin(request, env);
  if (origin) headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-headers", "content-type, idempotency-key");
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("cache-control", "no-store");
  headers.append("vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

export async function enforceLeadRateLimit(
  request: Request,
  env: LeadSecurityEnv,
) {
  if (!env.LEAD_RATE_LIMITER) {
    if (env.APP_ENV === "production") {
      throw new RequestSecurityError(
        503,
        "LEAD_PROTECTION_NOT_CONFIGURED",
        "Lead intake is temporarily unavailable.",
      );
    }
    return;
  }

  const clientIp = getClientIp(request);
  if (!clientIp) {
    throw new RequestSecurityError(
      400,
      "CLIENT_ADDRESS_REQUIRED",
      "A client address is required.",
    );
  }

  const result = await env.LEAD_RATE_LIMITER.limit({ key: clientIp });
  if (!result.success) {
    throw new RequestSecurityError(
      429,
      "RATE_LIMITED",
      "Too many requests. Please wait before trying again.",
    );
  }
}

export async function readJsonBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new RequestSecurityError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Use application/json for lead intake.",
    );
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RequestSecurityError(
      413,
      "BODY_TOO_LARGE",
      "The request is too large.",
    );
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new RequestSecurityError(
      413,
      "BODY_TOO_LARGE",
      "The request is too large.",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new RequestSecurityError(400, "INVALID_JSON", "Invalid JSON body.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestSecurityError(
      400,
      "INVALID_BODY",
      "The request body must be a JSON object.",
    );
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bounded(value: unknown, label: string, maxLength: number) {
  const normalized = asString(value);
  if (normalized.length > maxLength) {
    throw new RequestSecurityError(
      400,
      "INVALID_FIELD",
      `${label} is too long.`,
    );
  }
  return normalized;
}

function safeHttpUrl(value: unknown, label: string, maxLength = 2_048) {
  const normalized = bounded(value, label, maxLength);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error();
    return url.toString();
  } catch {
    throw new RequestSecurityError(
      400,
      "INVALID_FIELD",
      `${label} must be a valid web URL.`,
    );
  }
}

function safeNestedRecord(value: unknown, fields: Record<string, number>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, maxLength]) => [key, bounded(input[key], key, maxLength)])
      .filter(([, nestedValue]) => nestedValue),
  );
}

const WORKFLOW_LANES = new Set([
  "seller_high_priority",
  "valuation",
  "buyer_active_search",
  "buyer_early_stage",
  "relocation",
  "property_inquiry",
  "showing_request",
  "general_contact",
  "booked_consult",
  "nurture",
]);

export function validateAndMinimizeLeadBody(body: Record<string, unknown>) {
  const name = bounded(body.name, "Name", 120);
  const email = bounded(body.email, "Email", 254).toLowerCase();
  const phone = bounded(body.phone, "Phone", 40);
  const message = bounded(body.message, "Message", 4_000);
  const intent = bounded(body.intent, "Intent", 40) || "general_contact";
  const workflowLane =
    bounded(body.workflowLane, "Workflow lane", 40) || intent;

  if (!name || !email) {
    throw new RequestSecurityError(
      400,
      "REQUIRED_FIELDS_MISSING",
      "Name and email are required.",
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new RequestSecurityError(
      400,
      "INVALID_EMAIL",
      "A valid email is required.",
    );
  }

  if (!WORKFLOW_LANES.has(intent) || !WORKFLOW_LANES.has(workflowLane)) {
    throw new RequestSecurityError(
      400,
      "INVALID_INTENT",
      "The requested contact intent is invalid.",
    );
  }

  const consent =
    body.consent === true ||
    body.consent === 1 ||
    body.consent === "1" ||
    body.consent === "true" ||
    body.consent === "on";
  if (!consent) {
    throw new RequestSecurityError(
      400,
      "CONSENT_REQUIRED",
      "Consent is required.",
    );
  }

  return {
    name,
    email,
    phone,
    message,
    intent,
    workflowLane,
    formVariant: bounded(body.formVariant, "Form variant", 40),
    pageUrl: safeHttpUrl(body.pageUrl || body.sourcePath, "Page URL"),
    referrer: safeHttpUrl(body.referrer, "Referrer"),
    consent: true,
    listingId: bounded(body.listingId, "Listing ID", 128),
    sourceListingKey: bounded(body.sourceListingKey, "Source listing key", 128),
    details: safeNestedRecord(body.details, {
      propertyAddress: 500,
      targetPriceRange: 100,
      currentAddress: 500,
      sellingTimeline: 100,
      movingFrom: 200,
      moveTimeline: 100,
      preferredAreas: 500,
      buyerBudget: 100,
      propertyQuestion: 2_000,
      showingDate: 40,
      showingTime: 80,
    }),
    attribution: safeNestedRecord(body.attribution, {
      source: 200,
      medium: 200,
      campaign: 200,
    }),
    device: safeNestedRecord(body.device, {
      category: 20,
      screenWidth: 10,
      screenHeight: 10,
      language: 40,
      timezone: 80,
    }),
  };
}

function turnstileConfiguration(env: LeadSecurityEnv) {
  const expectedAction =
    asString(env.TURNSTILE_EXPECTED_ACTION) || DEFAULT_TURNSTILE_ACTION;
  const allowedHostnames = new Set(
    (env.TURNSTILE_HOSTNAMES || "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!expectedAction || allowedHostnames.size === 0) {
    throw new RequestSecurityError(
      503,
      "LEAD_PROTECTION_NOT_CONFIGURED",
      "Lead intake is temporarily unavailable.",
    );
  }

  return { expectedAction, allowedHostnames };
}

export async function verifyTurnstile(
  request: Request,
  env: LeadSecurityEnv,
  body: Record<string, unknown>,
) {
  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.APP_ENV === "production") {
      throw new RequestSecurityError(
        503,
        "LEAD_PROTECTION_NOT_CONFIGURED",
        "Lead intake is temporarily unavailable.",
      );
    }
    return;
  }

  const token =
    asString(body.turnstileToken) || asString(body["cf-turnstile-response"]);
  if (!token || token.length > 2_048) {
    throw new RequestSecurityError(
      400,
      "TURNSTILE_REQUIRED",
      "Bot protection verification is required.",
    );
  }

  const { expectedAction, allowedHostnames } = turnstileConfiguration(env);
  const payload = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  const remoteIp = getClientIp(request);
  if (remoteIp) payload.set("remoteip", remoteIp);

  let result: {
    success?: boolean;
    action?: string;
    hostname?: string;
    "error-codes"?: string[];
  };

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: payload,
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) throw new Error(`siteverify ${response.status}`);
    result = (await response.json()) as typeof result;
  } catch {
    throw new RequestSecurityError(
      502,
      "TURNSTILE_UNAVAILABLE",
      "Bot protection is temporarily unavailable.",
    );
  }

  const hostname = asString(result.hostname).toLowerCase();
  if (
    result.success !== true ||
    result.action !== expectedAction ||
    !allowedHostnames.has(hostname)
  ) {
    throw new RequestSecurityError(
      400,
      "TURNSTILE_FAILED",
      "Bot protection verification failed.",
    );
  }
}
