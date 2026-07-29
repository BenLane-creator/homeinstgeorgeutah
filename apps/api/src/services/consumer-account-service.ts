import { sanitizeSearchParams } from "./listing-service";
import {
  readVowSession,
  type VowAuthEnv,
  type VowSessionIdentity,
} from "./vow-auth-service";

export class ConsumerAccountError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedString(value: unknown, label: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > maxLength) {
    throw new ConsumerAccountError(400, "INVALID_FIELD", `${label} is too long.`);
  }
  return normalized;
}

export async function requireConsumerSession(
  env: VowAuthEnv,
  request: Request,
): Promise<VowSessionIdentity> {
  const session = await readVowSession(env, request);
  if (!session) {
    throw new ConsumerAccountError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Sign in to access this consumer account.",
    );
  }
  return session;
}

function listingCounty(listingId: string) {
  if (listingId.startsWith("washington:")) return "washington";
  if (listingId.startsWith("iron:")) return "iron";
  return null;
}

function requireScope(session: VowSessionIdentity, county: "washington" | "iron") {
  const scope = `${county}-vow`;
  if (!session.scopes.includes(scope)) {
    throw new ConsumerAccountError(
      403,
      "VOW_SCOPE_REQUIRED",
      `This account is not authorized for ${county === "washington" ? "Washington" : "Iron"} County VOW access.`,
    );
  }
  return scope;
}

export async function listSavedHomes(env: VowAuthEnv, session: VowSessionIdentity) {
  const result = await env.DB.prepare(
    `select sh.id, sh.listing_id, sh.source_listing_key, sh.created_at,
            lc.standard_status, lc.list_price, lc.property_type,
            lc.property_sub_type, lc.address_display, lc.city,
            lc.state_or_province, lc.postal_code, lc.bedrooms_total,
            lc.bathrooms_total, lc.living_area, lc.lot_size_acres,
            lc.list_office_name, lc.source_modified_at
       from saved_homes sh
       left join listing_cache lc on lc.id = sh.listing_id
      where sh.user_account_id = ?
      order by sh.created_at desc`,
  )
    .bind(session.userAccountId)
    .all<Record<string, unknown>>();
  return result.results;
}

export async function createSavedHome(
  env: VowAuthEnv,
  session: VowSessionIdentity,
  input: Record<string, unknown>,
) {
  const listingId = boundedString(input.listingId, "Listing ID", 160);
  const county = listingCounty(listingId);
  if (!listingId || !county) {
    throw new ConsumerAccountError(
      400,
      "INVALID_LISTING_ID",
      "A county-qualified canonical listing ID is required.",
    );
  }
  const scope = requireScope(session, county);
  const listing = await env.DB.prepare(
    `select id, source_listing_key
       from listing_cache
      where id = ? and county_key = ? and standard_status = 'Active'
      limit 1`,
  )
    .bind(listingId, county)
    .first<{ id: string; source_listing_key: string }>();
  if (!listing) {
    throw new ConsumerAccountError(
      404,
      "LISTING_NOT_AVAILABLE",
      "This listing is not available in the approved canonical cache.",
    );
  }

  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `insert into saved_homes
        (id, user_account_id, listing_id, source_listing_key)
       values (?, ?, ?, ?)
       on conflict(user_account_id, listing_id) do nothing`,
    ).bind(id, session.userAccountId, listing.id, listing.source_listing_key),
    env.DB.prepare(
      `insert into consumer_audit_events
        (id, user_account_id, event_type, scope_key, entity_id, payload_json)
       values (?, ?, 'saved_home_created', ?, ?, '{}')`,
    ).bind(crypto.randomUUID(), session.userAccountId, scope, listing.id),
  ]);

  const saved = await env.DB.prepare(
    `select id, listing_id, source_listing_key, created_at
       from saved_homes
      where user_account_id = ? and listing_id = ?
      limit 1`,
  )
    .bind(session.userAccountId, listing.id)
    .first<Record<string, unknown>>();
  return saved;
}

export async function deleteSavedHome(
  env: VowAuthEnv,
  session: VowSessionIdentity,
  id: string,
) {
  const savedId = boundedString(id, "Saved home ID", 80);
  const existing = await env.DB.prepare(
    `select id, listing_id
       from saved_homes
      where id = ? and user_account_id = ?
      limit 1`,
  )
    .bind(savedId, session.userAccountId)
    .first<{ id: string; listing_id: string }>();
  if (!existing) {
    throw new ConsumerAccountError(404, "SAVED_HOME_NOT_FOUND", "Saved home not found.");
  }
  const county = listingCounty(existing.listing_id);
  await env.DB.batch([
    env.DB.prepare("delete from saved_homes where id = ? and user_account_id = ?").bind(
      savedId,
      session.userAccountId,
    ),
    env.DB.prepare(
      `insert into consumer_audit_events
        (id, user_account_id, event_type, scope_key, entity_id, payload_json)
       values (?, ?, 'saved_home_deleted', ?, ?, '{}')`,
    ).bind(
      crypto.randomUUID(),
      session.userAccountId,
      county ? `${county}-vow` : null,
      existing.listing_id,
    ),
  ]);
}

function validatedSavedSearch(input: Record<string, unknown>) {
  const name = boundedString(input.name, "Search name", 100);
  if (!name) {
    throw new ConsumerAccountError(400, "SEARCH_NAME_REQUIRED", "Search name is required.");
  }
  const alertFrequency =
    boundedString(input.alertFrequency, "Alert frequency", 20) || "daily";
  if (!new Set(["none", "daily", "weekly"]).has(alertFrequency)) {
    throw new ConsumerAccountError(
      400,
      "INVALID_ALERT_FREQUENCY",
      "Alert frequency must be none, daily, or weekly.",
    );
  }

  const query = asRecord(input.query);
  const url = new URL("https://homeinstgeorgeutah.com/api/search");
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" || typeof value === "number") {
      url.searchParams.set(key, String(value));
    }
  }
  let sanitized: ReturnType<typeof sanitizeSearchParams>;
  try {
    sanitized = sanitizeSearchParams(url);
  } catch (error) {
    throw new ConsumerAccountError(
      400,
      "INVALID_SAVED_SEARCH",
      error instanceof Error ? error.message : "Saved search is invalid.",
    );
  }
  return { name, alertFrequency, query: sanitized };
}

export async function listSavedSearches(
  env: VowAuthEnv,
  session: VowSessionIdentity,
) {
  const result = await env.DB.prepare(
    `select id, name, query_json, alert_frequency, created_at, updated_at
       from saved_searches
      where user_account_id = ?
      order by updated_at desc`,
  )
    .bind(session.userAccountId)
    .all<{
      id: string;
      name: string;
      query_json: string;
      alert_frequency: string;
      created_at: string;
      updated_at: string;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    query: JSON.parse(row.query_json),
    alertFrequency: row.alert_frequency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createSavedSearch(
  env: VowAuthEnv,
  session: VowSessionIdentity,
  input: Record<string, unknown>,
) {
  const saved = validatedSavedSearch(input);
  requireScope(session, saved.query.county);
  const id = crypto.randomUUID();
  const scope = `${saved.query.county}-vow`;
  await env.DB.batch([
    env.DB.prepare(
      `insert into saved_searches
        (id, user_account_id, name, query_json, alert_frequency)
       values (?, ?, ?, ?, ?)`,
    ).bind(
      id,
      session.userAccountId,
      saved.name,
      JSON.stringify(saved.query),
      saved.alertFrequency,
    ),
    env.DB.prepare(
      `insert into consumer_audit_events
        (id, user_account_id, event_type, scope_key, entity_id, payload_json)
       values (?, ?, 'saved_search_created', ?, ?, '{}')`,
    ).bind(crypto.randomUUID(), session.userAccountId, scope, id),
  ]);

  return {
    id,
    name: saved.name,
    query: saved.query,
    alertFrequency: saved.alertFrequency,
  };
}

export async function deleteSavedSearch(
  env: VowAuthEnv,
  session: VowSessionIdentity,
  id: string,
) {
  const savedId = boundedString(id, "Saved search ID", 80);
  const existing = await env.DB.prepare(
    `select id, query_json
       from saved_searches
      where id = ? and user_account_id = ?
      limit 1`,
  )
    .bind(savedId, session.userAccountId)
    .first<{ id: string; query_json: string }>();
  if (!existing) {
    throw new ConsumerAccountError(
      404,
      "SAVED_SEARCH_NOT_FOUND",
      "Saved search not found.",
    );
  }
  const query = asRecord(JSON.parse(existing.query_json));
  const county = query.county === "iron" ? "iron" : "washington";
  await env.DB.batch([
    env.DB.prepare("delete from saved_searches where id = ? and user_account_id = ?").bind(
      savedId,
      session.userAccountId,
    ),
    env.DB.prepare(
      `insert into consumer_audit_events
        (id, user_account_id, event_type, scope_key, entity_id, payload_json)
       values (?, ?, 'saved_search_deleted', ?, ?, '{}')`,
    ).bind(crypto.randomUUID(), session.userAccountId, `${county}-vow`, savedId),
  ]);
}
