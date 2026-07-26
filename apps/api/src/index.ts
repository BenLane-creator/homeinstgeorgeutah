import {
  providerMeta,
  sanitizeSearchParams,
  SearchInputError,
  searchListings,
  type ListingServiceEnv,
} from "./services/listing-service";
import { storeLeadIntake } from "./services/lead-service";
import { getAllMlsScopeStates } from "./services/mls-scope-service";
import {
  addWriteResponseHeaders,
  enforceLeadRateLimit,
  readJsonBody,
  RequestSecurityError,
  requireApprovedWriteOrigin,
  type LeadSecurityEnv,
  validateAndMinimizeLeadBody,
  verifyTurnstile,
} from "./security/request-security";

export interface Env extends ListingServiceEnv, LeadSecurityEnv {
  DB: D1Database;
}

type ApiResponse = {
  ok: boolean;
  data?: unknown;
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

function json(payload: ApiResponse, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...init.headers,
    },
  });
}

function metadata() {
  return {
    ...providerMeta,
    generatedAt: new Date().toISOString(),
  };
}

function apiError(status: number, code: string, message: string) {
  return json(
    {
      ok: false,
      error: { code, message },
      meta: metadata(),
    },
    { status },
  );
}

function methodNotAllowed(allowed: string[]) {
  return json(
    {
      ok: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `Use ${allowed.join(" or ")}.`,
      },
      meta: metadata(),
    },
    { status: 405, headers: { allow: allowed.join(", ") } },
  );
}

function notFound(pathname: string) {
  return apiError(404, "NOT_FOUND", `No API route exists for ${pathname}.`);
}

function handleHealth() {
  return json({
    ok: true,
    data: {
      service: "homeinstgeorgeutah-api",
      status: "ok",
      routes: [
        "/api/health",
        "/api/mls-status",
        "/api/search",
        "/api/v1/auth/flexmls/callback",
        "/api/v1/leads/intake",
      ],
    },
    meta: metadata(),
  });
}

async function handleSearch(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  try {
    const params = sanitizeSearchParams(new URL(request.url));
    const data = await searchListings(env, params);
    return json({ ok: true, data, meta: metadata() });
  } catch (error) {
    if (error instanceof SearchInputError) {
      return apiError(400, "INVALID_SEARCH", error.message);
    }

    return apiError(
      502,
      "MLS_UPSTREAM_ERROR",
      "Live listings are temporarily unavailable. Contact Joel for current availability.",
    );
  }
}

function handleMlsStatus(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const scopes = getAllMlsScopeStates(env);
  return json({
    ok: true,
    data: {
      active: scopes.some((scope) => scope.active),
      liveIdxScopes: scopes
        .filter((scope) => scope.role === "idx" && scope.active)
        .map((scope) => scope.key),
      liveVowScopes: scopes
        .filter((scope) => scope.role === "vow" && scope.active)
        .map((scope) => scope.key),
      scopes,
    },
    meta: metadata(),
  });
}

function handleVowCallback(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  const providerDescription = url.searchParams.get("error_description");

  if (providerError) {
    return json(
      {
        ok: false,
        error: {
          code: "VOW_AUTHORIZATION_REJECTED",
          message:
            providerDescription ||
            "The VOW authorization request was not completed.",
        },
        meta: metadata(),
      },
      {
        status: 400,
        headers: {
          "cache-control": "no-store",
          pragma: "no-cache",
        },
      },
    );
  }

  const vowScopes = getAllMlsScopeStates(env).filter(
    (scope) => scope.role === "vow" && scope.active,
  );

  return json(
    {
      ok: false,
      error: {
        code: "VOW_AUTHORIZATION_PENDING",
        message:
          vowScopes.length === 0
            ? "VOW access is not active while MLS approvals and production credentials remain pending."
            : "The production VOW token exchange and local account-linking workflow is not enabled yet.",
      },
      meta: metadata(),
    },
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    },
  );
}

async function handleLead(request: Request, env: Env) {
  try {
    requireApprovedWriteOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    await enforceLeadRateLimit(request, env);
    const rawBody = await readJsonBody(request);
    await verifyTurnstile(request, env, rawBody);
    const body = validateAndMinimizeLeadBody(rawBody);
    const url = new URL(request.url);

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
          message: "Your request was received.",
          leadEventId: storedLead.leadEventId,
          workflowLane: storedLead.workflowLane,
        },
        meta: metadata(),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RequestSecurityError) {
      return apiError(error.status, error.code, error.message);
    }

    return apiError(
      500,
      "LEAD_INTAKE_FAILED",
      "We could not receive your request. Please call Joel directly.",
    );
  }
}

export async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, "") || "/";

  if (pathname === "/" || pathname === "/api" || pathname === "/api/health") {
    return request.method === "GET"
      ? handleHealth()
      : methodNotAllowed(["GET"]);
  }

  if (pathname === "/api/search") {
    return handleSearch(request, env);
  }

  if (pathname === "/api/mls-status") {
    return handleMlsStatus(request, env);
  }

  if (pathname === "/api/v1/auth/flexmls/callback") {
    return handleVowCallback(request, env);
  }

  if (pathname.startsWith("/api/listings/")) {
    return apiError(
      404,
      "LISTING_DETAILS_DISABLED",
      "Public listing details are not available. Contact Joel for property information.",
    );
  }

  if (pathname === "/api/leads" || pathname === "/api/v1/leads/intake") {
    const response = await handleLead(request, env);
    const withHeaders = addWriteResponseHeaders(request, env, response);
    if (pathname === "/api/leads") {
      const headers = new Headers(withHeaders.headers);
      headers.set("deprecation", "true");
      headers.set("link", '</api/v1/leads/intake>; rel="successor-version"');
      return new Response(withHeaders.body, {
        status: withHeaders.status,
        statusText: withHeaders.statusText,
        headers,
      });
    }
    return withHeaders;
  }

  if (request.method === "OPTIONS") {
    return notFound(url.pathname);
  }

  return notFound(url.pathname);
}

export default {
  fetch: handleRequest,
};
