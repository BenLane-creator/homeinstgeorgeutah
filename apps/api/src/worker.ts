import baseWorker, {
  handleRequest as handleBaseRequest,
  type Env as BaseEnv,
} from "./index";
import {
  AccountAccessError,
  accountProfile,
  clearAccountSessionCookie,
  deleteSavedHome,
  deleteSavedSearch,
  listSavedHomes,
  listSavedSearches,
  readAccountSession,
  requireAccountSession,
  revokeAccountSession,
  saveHome,
  saveSearch,
  type AccountServiceEnv,
} from "./services/account-service";
import { sanitizeSearchParams } from "./services/listing-service";
import { isMlsCounty } from "./services/mls-scope-service";
import {
  beginVowAuthorization,
  completeVowAuthorization,
  VowAuthError,
  type VowAuthEnv,
} from "./services/vow-auth-service";
import {
  readJsonBody,
  RequestSecurityError,
  requireApprovedWriteOrigin,
} from "./security/request-security";

export interface Env extends BaseEnv, AccountServiceEnv, VowAuthEnv {}

type ApiPayload = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
};

function json(payload: ApiPayload, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(payload, null, 2), { ...init, headers });
}

function apiError(status: number, code: string, message: string) {
  return json({ ok: false, error: { code, message } }, { status });
}

function methodNotAllowed(allowed: string[]) {
  return apiError(405, "METHOD_NOT_ALLOWED", `Use ${allowed.join(" or ")}.`);
}

function siteOrigin(env: Env, request: Request) {
  const configured = env.SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") return url.origin;
    } catch {
      // Fall back to the request origin for local development only.
    }
  }
  return new URL(request.url).origin;
}

function accountRedirect(
  env: Env,
  request: Request,
  pathname: string,
  status: "success" | "error",
  code?: string,
) {
  const target = new URL(pathname, siteOrigin(env, request));
  if (target.origin !== siteOrigin(env, request)) {
    target.href = `${siteOrigin(env, request)}/account/`;
  }
  target.searchParams.set("auth", status);
  if (code) target.searchParams.set("code", code.slice(0, 100));
  return target.toString();
}

async function handleVowStart(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const url = new URL(request.url);
  const county = url.searchParams.get("county");
  if (!isMlsCounty(county)) {
    return apiError(
      400,
      "INVALID_MLS_SCOPE",
      "County must be washington or iron.",
    );
  }
  const authorizationUrl = await beginVowAuthorization(
    env,
    county,
    url.searchParams.get("redirect"),
  );
  return new Response(null, {
    status: 302,
    headers: {
      location: authorizationUrl,
      "cache-control": "no-store",
      pragma: "no-cache",
      "referrer-policy": "no-referrer",
    },
  });
}

async function handleVowCallback(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  try {
    const result = await completeVowAuthorization(env, request);
    return new Response(null, {
      status: 302,
      headers: {
        location: accountRedirect(env, request, result.redirectAfter, "success"),
        "set-cookie": result.cookie,
        "cache-control": "no-store",
        pragma: "no-cache",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    const code =
      error instanceof VowAuthError ? error.code : "VOW_AUTHORIZATION_FAILED";
    return new Response(null, {
      status: 302,
      headers: {
        location: accountRedirect(env, request, "/account/", "error", code),
        "cache-control": "no-store",
        pragma: "no-cache",
        "referrer-policy": "no-referrer",
      },
    });
  }
}

async function handleSession(request: Request, env: Env) {
  if (request.method !== "GET") return methodNotAllowed(["GET"]);
  const session = await readAccountSession(env, request);
  if (!session) return json({ ok: true, data: { authenticated: false } });
  return json({
    ok: true,
    data: {
      authenticated: true,
      account: await accountProfile(env, session),
    },
  });
}

async function handleLogout(request: Request, env: Env) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  requireApprovedWriteOrigin(request, env);
  await revokeAccountSession(env, request);
  return json(
    { ok: true, data: { authenticated: false } },
    { headers: { "set-cookie": clearAccountSessionCookie() } },
  );
}

async function handleSavedHomes(request: Request, env: Env) {
  const session = await requireAccountSession(env, request);
  if (request.method === "GET") {
    return json({ ok: true, data: await listSavedHomes(env, session) });
  }
  if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);
  requireApprovedWriteOrigin(request, env);
  const body = await readJsonBody(request);
  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  const sourceListingKey =
    typeof body.sourceListingKey === "string" ? body.sourceListingKey : undefined;
  return json(
    {
      ok: true,
      data: await saveHome(env, session, { listingId, sourceListingKey }),
    },
    { status: 201 },
  );
}

async function handleSavedHomeDelete(
  request: Request,
  env: Env,
  savedHomeId: string,
) {
  if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
  requireApprovedWriteOrigin(request, env);
  const session = await requireAccountSession(env, request);
  return json({
    ok: true,
    data: await deleteSavedHome(env, session, savedHomeId),
  });
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (typeof nested === "string") result[key] = nested;
    else if (typeof nested === "number" && Number.isFinite(nested)) {
      result[key] = String(nested);
    }
  }
  return result;
}

async function handleSavedSearches(request: Request, env: Env) {
  const session = await requireAccountSession(env, request);
  if (request.method === "GET") {
    return json({ ok: true, data: await listSavedSearches(env, session) });
  }
  if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);
  requireApprovedWriteOrigin(request, env);
  const body = await readJsonBody(request);
  const county = typeof body.county === "string" ? body.county : "";
  if (!isMlsCounty(county)) {
    return apiError(
      400,
      "INVALID_MLS_SCOPE",
      "County must be washington or iron.",
    );
  }
  const rawQuery = stringRecord(body.query);
  rawQuery.county = county;
  const url = new URL("https://account.local/api/search");
  for (const [key, value] of Object.entries(rawQuery)) {
    if (value) url.searchParams.set(key, value);
  }
  const normalizedQuery = sanitizeSearchParams(url);
  const alertFrequency =
    body.alertFrequency === "weekly" || body.alertFrequency === "off"
      ? body.alertFrequency
      : "daily";
  const name = typeof body.name === "string" ? body.name : "Saved search";
  return json(
    {
      ok: true,
      data: await saveSearch(env, session, {
        county,
        name,
        query: normalizedQuery,
        alertFrequency,
      }),
    },
    { status: 201 },
  );
}

async function handleSavedSearchDelete(
  request: Request,
  env: Env,
  savedSearchId: string,
) {
  if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
  requireApprovedWriteOrigin(request, env);
  const session = await requireAccountSession(env, request);
  return json({
    ok: true,
    data: await deleteSavedSearch(env, session, savedSearchId),
  });
}

export async function handleRequest(
  request: Request,
  env: Env,
  context?: ExecutionContext,
) {
  const pathname = new URL(request.url).pathname.replace(/\/$/, "") || "/";
  try {
    if (pathname === "/api/v1/auth/flexmls/start") {
      return await handleVowStart(request, env);
    }
    if (pathname === "/api/v1/auth/flexmls/callback") {
      return await handleVowCallback(request, env);
    }
    if (pathname === "/api/v1/auth/logout") {
      return await handleLogout(request, env);
    }
    if (pathname === "/api/v1/account/session") {
      return await handleSession(request, env);
    }
    if (pathname === "/api/v1/account/saved-homes") {
      return await handleSavedHomes(request, env);
    }
    if (pathname.startsWith("/api/v1/account/saved-homes/")) {
      return await handleSavedHomeDelete(
        request,
        env,
        pathname.slice("/api/v1/account/saved-homes/".length),
      );
    }
    if (pathname === "/api/v1/account/saved-searches") {
      return await handleSavedSearches(request, env);
    }
    if (pathname.startsWith("/api/v1/account/saved-searches/")) {
      return await handleSavedSearchDelete(
        request,
        env,
        pathname.slice("/api/v1/account/saved-searches/".length),
      );
    }
    return handleBaseRequest(request, env, context);
  } catch (error) {
    if (error instanceof VowAuthError) {
      return apiError(error.status, error.code, error.message);
    }
    if (error instanceof AccountAccessError) {
      return apiError(error.status, error.code, error.message);
    }
    if (error instanceof RequestSecurityError) {
      return apiError(error.status, error.code, error.message);
    }
    return apiError(500, "ACCOUNT_OPERATION_FAILED", "The account request failed.");
  }
}

export default {
  fetch: handleRequest,
  scheduled: baseWorker.scheduled,
};
