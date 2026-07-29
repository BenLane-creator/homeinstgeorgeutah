import { randomToken, sha256 } from "../security/crypto";
import { getClientIp } from "../security/request-security";
import type { MlsCounty } from "./mls-scope-service";

export interface AccountServiceEnv {
  DB: D1Database;
  ACCOUNT_SESSION_TTL_SECONDS?: string;
}

export class AccountAccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const ACCOUNT_SESSION_COOKIE = "__Host-hisgu_session";

export type AccountSession = {
  sessionId: string;
  userAccountId: string;
  email: string;
  emailNormalized: string;
  fullName: string | null;
  expiresAt: string;
};

function parseCookies(request: Request) {
  const result = new Map<string, string>();
  for (const pair of (request.headers.get("cookie") || "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name) result.set(name, value);
  }
  return result;
}

function sessionTtlSeconds(env: AccountServiceEnv) {
  const requested = Number(env.ACCOUNT_SESSION_TTL_SECONDS || 1_209_600);
  if (!Number.isFinite(requested)) return 1_209_600;
  return Math.max(3_600, Math.min(Math.floor(requested), 2_592_000));
}

export function accountSessionCookie(token: string, expiresAt: string) {
  const maxAge = Math.max(
    0,
    Math.floor((Date.parse(expiresAt) - Date.now()) / 1_000),
  );
  return `${ACCOUNT_SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearAccountSessionCookie() {
  return `${ACCOUNT_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function createAccountSession(
  env: AccountServiceEnv,
  userAccountId: string,
  request: Request,
) {
  const token = randomToken(48);
  const sessionHash = await sha256(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + sessionTtlSeconds(env) * 1_000,
  ).toISOString();
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 500) || null;
  const ipAddress = getClientIp(request).slice(0, 100) || null;

  await env.DB.batch([
    env.DB.prepare(
      `insert into user_auth_sessions (
        id, user_account_id, session_hash, expires_at, last_seen_at, user_agent, ip_address
      ) values (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
    ).bind(
      sessionId,
      userAccountId,
      sessionHash,
      expiresAt,
      userAgent,
      ipAddress,
    ),
    env.DB.prepare(
      `insert into account_audit_events (
        id, user_account_id, session_id, event_type, payload_json
      ) values (?, ?, ?, 'session_created', ?)`,
    ).bind(
      crypto.randomUUID(),
      userAccountId,
      sessionId,
      JSON.stringify({ expiresAt }),
    ),
  ]);

  return { token, sessionId, expiresAt };
}

export async function readAccountSession(
  env: AccountServiceEnv,
  request: Request,
): Promise<AccountSession | null> {
  const token = parseCookies(request).get(ACCOUNT_SESSION_COOKIE);
  if (!token || token.length > 256) return null;
  const sessionHash = await sha256(token);
  const row = await env.DB.prepare(
    `select
      sessions.id as session_id,
      sessions.user_account_id,
      sessions.expires_at,
      accounts.email,
      accounts.email_normalized,
      contacts.full_name
    from user_auth_sessions sessions
    join user_accounts accounts on accounts.id = sessions.user_account_id
    left join contacts on contacts.id = accounts.contact_id
    where sessions.session_hash = ?
      and sessions.revoked_at is null
      and accounts.status = 'active'
    limit 1`,
  )
    .bind(sessionHash)
    .first<{
      session_id: string;
      user_account_id: string;
      expires_at: string;
      email: string;
      email_normalized: string;
      full_name: string | null;
    }>();

  if (!row || Date.parse(row.expires_at) <= Date.now()) return null;

  await env.DB.prepare(
    `update user_auth_sessions set last_seen_at = CURRENT_TIMESTAMP where id = ?`,
  )
    .bind(row.session_id)
    .run();

  return {
    sessionId: row.session_id,
    userAccountId: row.user_account_id,
    email: row.email,
    emailNormalized: row.email_normalized,
    fullName: row.full_name,
    expiresAt: row.expires_at,
  };
}

export async function requireAccountSession(
  env: AccountServiceEnv,
  request: Request,
) {
  const session = await readAccountSession(env, request);
  if (!session) {
    throw new AccountAccessError(
      401,
      "ACCOUNT_SESSION_REQUIRED",
      "Sign in to use this account feature.",
    );
  }
  return session;
}

export async function revokeAccountSession(
  env: AccountServiceEnv,
  request: Request,
) {
  const session = await readAccountSession(env, request);
  if (!session) return false;
  await env.DB.batch([
    env.DB.prepare(
      `update user_auth_sessions
       set revoked_at = CURRENT_TIMESTAMP
       where id = ? and revoked_at is null`,
    ).bind(session.sessionId),
    env.DB.prepare(
      `insert into account_audit_events (
        id, user_account_id, session_id, event_type, payload_json
      ) values (?, ?, ?, 'session_revoked', '{}')`,
    ).bind(crypto.randomUUID(), session.userAccountId, session.sessionId),
  ]);
  return true;
}

export async function accountProfile(
  env: AccountServiceEnv,
  session: AccountSession,
) {
  const grants = await env.DB.prepare(
    `select scope_key, status, access_expires_at, last_verified_at
     from vow_account_grants
     where user_account_id = ?
     order by scope_key`,
  )
    .bind(session.userAccountId)
    .all<{
      scope_key: string;
      status: string;
      access_expires_at: string | null;
      last_verified_at: string;
    }>();

  return {
    email: session.email,
    fullName: session.fullName,
    sessionExpiresAt: session.expiresAt,
    grants: grants.results || [],
  };
}

async function requireCountyGrant(
  env: AccountServiceEnv,
  userAccountId: string,
  county: MlsCounty,
) {
  const grant = await env.DB.prepare(
    `select id from vow_account_grants
     where user_account_id = ? and scope_key = ? and status = 'active'
     limit 1`,
  )
    .bind(userAccountId, `${county}-vow`)
    .first<{ id: string }>();
  if (!grant) {
    throw new AccountAccessError(
      403,
      "COUNTY_VOW_GRANT_REQUIRED",
      `An active ${county === "washington" ? "Washington" : "Iron"} County account authorization is required.`,
    );
  }
}

function listingCounty(listingId: string): MlsCounty | null {
  if (listingId.startsWith("washington:")) return "washington";
  if (listingId.startsWith("iron:")) return "iron";
  return null;
}

export async function listSavedHomes(
  env: AccountServiceEnv,
  session: AccountSession,
) {
  const rows = await env.DB.prepare(
    `select id, listing_id, source_listing_key, county_key, scope_key, created_at
     from saved_homes
     where user_account_id = ?
     order by created_at desc`,
  )
    .bind(session.userAccountId)
    .all();
  return rows.results || [];
}

export async function saveHome(
  env: AccountServiceEnv,
  session: AccountSession,
  input: { listingId: string; sourceListingKey?: string },
) {
  const listingId = input.listingId.trim();
  const county = listingCounty(listingId);
  if (!county || listingId.length > 220) {
    throw new AccountAccessError(
      400,
      "INVALID_LISTING_ID",
      "The listing identifier is invalid.",
    );
  }
  await requireCountyGrant(env, session.userAccountId, county);

  const savedHomeId = crypto.randomUUID();
  const sourceListingKey = input.sourceListingKey?.trim().slice(0, 180) || null;
  const result = await env.DB.prepare(
    `insert into saved_homes (
      id, user_account_id, listing_id, source_listing_key, county_key, scope_key
    ) values (?, ?, ?, ?, ?, ?)
    on conflict(user_account_id, listing_id) do update set
      source_listing_key = coalesce(excluded.source_listing_key, saved_homes.source_listing_key),
      county_key = excluded.county_key,
      scope_key = excluded.scope_key
    returning id, listing_id, source_listing_key, county_key, scope_key, created_at`,
  )
    .bind(
      savedHomeId,
      session.userAccountId,
      listingId,
      sourceListingKey,
      county,
      `${county}-vow`,
    )
    .first();

  await env.DB.prepare(
    `insert into account_audit_events (
      id, user_account_id, session_id, event_type, scope_key, payload_json
    ) values (?, ?, ?, 'saved_home_created', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      session.userAccountId,
      session.sessionId,
      `${county}-vow`,
      JSON.stringify({ listingId }),
    )
    .run();

  return result;
}

export async function deleteSavedHome(
  env: AccountServiceEnv,
  session: AccountSession,
  savedHomeId: string,
) {
  const row = await env.DB.prepare(
    `delete from saved_homes
     where id = ? and user_account_id = ?
     returning listing_id, scope_key`,
  )
    .bind(savedHomeId, session.userAccountId)
    .first<{ listing_id: string; scope_key: string | null }>();
  if (!row) {
    throw new AccountAccessError(404, "SAVED_HOME_NOT_FOUND", "Saved home not found.");
  }
  await env.DB.prepare(
    `insert into account_audit_events (
      id, user_account_id, session_id, event_type, scope_key, payload_json
    ) values (?, ?, ?, 'saved_home_deleted', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      session.userAccountId,
      session.sessionId,
      row.scope_key,
      JSON.stringify({ listingId: row.listing_id }),
    )
    .run();
  return { deleted: true };
}

export async function listSavedSearches(
  env: AccountServiceEnv,
  session: AccountSession,
) {
  const rows = await env.DB.prepare(
    `select
      searches.id,
      searches.name,
      searches.county_key,
      searches.query_json,
      searches.alert_frequency,
      searches.status,
      searches.created_at,
      subscriptions.status as subscription_status
    from saved_searches searches
    left join search_subscriptions subscriptions on subscriptions.saved_search_id = searches.id
    where searches.user_account_id = ?
    order by searches.created_at desc`,
  )
    .bind(session.userAccountId)
    .all();
  return rows.results || [];
}

export async function saveSearch(
  env: AccountServiceEnv,
  session: AccountSession,
  input: {
    county: MlsCounty;
    name: string;
    query: Record<string, string | undefined>;
    alertFrequency: "off" | "daily" | "weekly";
  },
) {
  await requireCountyGrant(env, session.userAccountId, input.county);
  const name = input.name.trim().slice(0, 120) || "Saved search";
  const savedSearchId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(
      `insert into saved_searches (
        id, user_account_id, name, query_json, alert_frequency, county_key, status
      ) values (?, ?, ?, ?, ?, ?, 'active')`,
    ).bind(
      savedSearchId,
      session.userAccountId,
      name,
      JSON.stringify(input.query),
      input.alertFrequency,
      input.county,
    ),
    env.DB.prepare(
      `insert into account_audit_events (
        id, user_account_id, session_id, event_type, scope_key, payload_json
      ) values (?, ?, ?, 'saved_search_created', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      session.userAccountId,
      session.sessionId,
      `${input.county}-vow`,
      JSON.stringify({ savedSearchId, alertFrequency: input.alertFrequency }),
    ),
  ];
  if (input.alertFrequency !== "off") {
    statements.splice(
      1,
      0,
      env.DB.prepare(
        `insert into search_subscriptions (
          id, saved_search_id, status
        ) values (?, ?, 'active')`,
      ).bind(crypto.randomUUID(), savedSearchId),
    );
  }
  await env.DB.batch(statements);
  return { id: savedSearchId, name, county: input.county };
}

export async function deleteSavedSearch(
  env: AccountServiceEnv,
  session: AccountSession,
  savedSearchId: string,
) {
  const row = await env.DB.prepare(
    `select county_key from saved_searches
     where id = ? and user_account_id = ? limit 1`,
  )
    .bind(savedSearchId, session.userAccountId)
    .first<{ county_key: string | null }>();
  if (!row) {
    throw new AccountAccessError(
      404,
      "SAVED_SEARCH_NOT_FOUND",
      "Saved search not found.",
    );
  }
  await env.DB.batch([
    env.DB.prepare(`delete from search_subscriptions where saved_search_id = ?`).bind(
      savedSearchId,
    ),
    env.DB.prepare(
      `delete from saved_searches where id = ? and user_account_id = ?`,
    ).bind(savedSearchId, session.userAccountId),
    env.DB.prepare(
      `insert into account_audit_events (
        id, user_account_id, session_id, event_type, scope_key, payload_json
      ) values (?, ?, ?, 'saved_search_deleted', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      session.userAccountId,
      session.sessionId,
      row.county_key ? `${row.county_key}-vow` : null,
      JSON.stringify({ savedSearchId }),
    ),
  ]);
  return { deleted: true };
}
