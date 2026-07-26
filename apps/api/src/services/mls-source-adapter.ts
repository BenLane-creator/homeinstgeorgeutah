import {
  getActiveIdxSource,
  type MlsCounty,
  type MlsScopeEnv,
} from "./mls-scope-service";

export interface MlsSyncEnv extends MlsScopeEnv {
  DB: D1Database;
}

type UnknownRecord = Record<string, unknown>;

type CanonicalListing = {
  id: string;
  county: MlsCounty;
  scopeKey: `${MlsCounty}-idx`;
  provider: string;
  sourceListingKey: string;
  standardStatus: string | null;
  city: string | null;
  stateOrProvince: string | null;
  postalCode: string | null;
  listPrice: number | null;
  bedroomsTotal: number | null;
  bathroomsTotal: number | null;
  livingArea: number | null;
  propertyType: string | null;
  propertySubType: string | null;
  addressDisplay: string | null;
  lotSizeAcres: number | null;
  listOfficeName: string | null;
  subdivision: string | null;
  sourceModifiedAt: string | null;
};

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
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function listingCandidates(payload: unknown) {
  const root = asRecord(payload);
  const nested = root ? (asRecord(root.d) ?? asRecord(root.D)) : null;
  if (root && Array.isArray(root.value)) return root.value;
  if (root && Array.isArray(root.Results)) return root.Results;
  if (root && Array.isArray(root.results)) return root.results;
  if (nested && Array.isArray(nested.Results)) return nested.Results;
  if (nested && Array.isArray(nested.results)) return nested.results;
  if (nested) return [nested];
  return [];
}

export function normalizeProviderListing(
  value: unknown,
  county: MlsCounty,
  provider: string,
): CanonicalListing | null {
  const record = asRecord(value);
  if (!record) return null;

  const sourceListingKey = firstString(record, ["ListingKey", "ListingId"]);
  if (!sourceListingKey) return null;

  return {
    id: `${county}:${sourceListingKey}`,
    county,
    scopeKey: `${county}-idx`,
    provider,
    sourceListingKey,
    standardStatus: firstString(record, ["StandardStatus"]),
    city: firstString(record, ["City"]),
    stateOrProvince: firstString(record, ["StateOrProvince"]),
    postalCode: firstString(record, ["PostalCode"]),
    listPrice: firstNumber(record, ["ListPrice"]),
    bedroomsTotal: firstNumber(record, ["BedroomsTotal"]),
    bathroomsTotal: firstNumber(record, [
      "BathroomsTotalInteger",
      "BathroomsTotalDecimal",
    ]),
    livingArea: firstNumber(record, ["LivingArea"]),
    propertyType: firstString(record, ["PropertyType"]),
    propertySubType: firstString(record, ["PropertySubType"]),
    addressDisplay: firstString(record, ["UnparsedAddress"]),
    lotSizeAcres: firstNumber(record, ["LotSizeAcres"]),
    listOfficeName: firstString(record, ["ListOfficeName"]),
    subdivision: firstString(record, ["SubdivisionName"]),
    sourceModifiedAt: firstString(record, ["ModificationTimestamp"]),
  };
}

function selectFields() {
  return [
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
    "SubdivisionName",
    "ListOfficeName",
    "ModificationTimestamp",
  ].join(",");
}

async function currentCursor(env: MlsSyncEnv, scopeKey: string) {
  const row = await env.DB.prepare(
    `select cursor_value from mls_sync_cursors
      where scope_key = ? and resource_name = 'Property' limit 1`,
  )
    .bind(scopeKey)
    .first<{ cursor_value: string | null }>();
  return row?.cursor_value || null;
}

function maxTimestamp(listings: CanonicalListing[], fallback: string | null) {
  return listings.reduce<string | null>((latest, listing) => {
    const candidate = listing.sourceModifiedAt;
    if (!candidate) return latest;
    return !latest || candidate > latest ? candidate : latest;
  }, fallback);
}

export type MlsSyncResult = {
  scopeKey: `${MlsCounty}-idx`;
  status: "succeeded" | "failed" | "skipped";
  recordsReceived: number;
  recordsWritten: number;
  cursorBefore: string | null;
  cursorAfter: string | null;
  error?: string;
};

export async function syncMlsPropertyCache(
  env: MlsSyncEnv,
  county: MlsCounty,
): Promise<MlsSyncResult> {
  const scopeKey = `${county}-idx` as const;
  const source = getActiveIdxSource(env, county);
  const cursorBefore = await currentCursor(env, scopeKey);
  const runId = crypto.randomUUID();

  if (!source) {
    await env.DB.prepare(
      `insert into mls_sync_runs
        (id, scope_key, status, cursor_before, cursor_after, completed_at)
       values (?, ?, 'skipped', ?, ?, CURRENT_TIMESTAMP)`,
    )
      .bind(runId, scopeKey, cursorBefore, cursorBefore)
      .run();
    return {
      scopeKey,
      status: "skipped",
      recordsReceived: 0,
      recordsWritten: 0,
      cursorBefore,
      cursorAfter: cursorBefore,
    };
  }

  await env.DB.prepare(
    `insert into mls_sync_runs (id, scope_key, status, cursor_before)
     values (?, ?, 'started', ?)`,
  )
    .bind(runId, scopeKey, cursorBefore)
    .run();

  try {
    const baseUrl = new URL(source.apiBaseUrl);
    if (baseUrl.protocol !== "https:") {
      throw new Error("The MLS source URL must use HTTPS.");
    }

    const url = new URL(`${baseUrl.toString().replace(/\/$/, "")}/Property`);
    url.searchParams.set("$top", "40");
    url.searchParams.set("$orderby", "ModificationTimestamp asc");
    url.searchParams.set("$select", selectFields());
    if (cursorBefore) {
      url.searchParams.set(
        "$filter",
        `ModificationTimestamp gt ${cursorBefore}`,
      );
    }

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${source.accessToken}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`MLS source returned HTTP ${response.status}.`);
    }

    const payload: unknown = await response.json();
    const candidates = listingCandidates(payload);
    const listings = candidates
      .map((candidate) =>
        normalizeProviderListing(candidate, county, source.provider),
      )
      .filter((listing): listing is CanonicalListing => listing !== null);
    const cursorAfter = maxTimestamp(listings, cursorBefore);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1_000).toISOString();

    const statements: D1PreparedStatement[] = [];
    for (const listing of listings) {
      statements.push(
        env.DB.prepare(
          `insert into listing_cache
            (id, provider, source_listing_key, standard_status, city,
             state_or_province, postal_code, list_price, bedrooms_total,
             bathrooms_total, living_area, raw_json, display_json,
             last_synced_at, county_key, scope_key, property_type,
             property_sub_type, address_display, lot_size_acres,
             list_office_name, source_modified_at, cache_expires_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, CURRENT_TIMESTAMP,
                   ?, ?, ?, ?, ?, ?, ?, ?, ?)
           on conflict(id) do update set
             provider = excluded.provider,
             source_listing_key = excluded.source_listing_key,
             standard_status = excluded.standard_status,
             city = excluded.city,
             state_or_province = excluded.state_or_province,
             postal_code = excluded.postal_code,
             list_price = excluded.list_price,
             bedrooms_total = excluded.bedrooms_total,
             bathrooms_total = excluded.bathrooms_total,
             living_area = excluded.living_area,
             raw_json = null,
             display_json = excluded.display_json,
             last_synced_at = CURRENT_TIMESTAMP,
             county_key = excluded.county_key,
             scope_key = excluded.scope_key,
             property_type = excluded.property_type,
             property_sub_type = excluded.property_sub_type,
             address_display = excluded.address_display,
             lot_size_acres = excluded.lot_size_acres,
             list_office_name = excluded.list_office_name,
             source_modified_at = excluded.source_modified_at,
             cache_expires_at = excluded.cache_expires_at,
             updated_at = CURRENT_TIMESTAMP`,
        ).bind(
          listing.id,
          listing.provider,
          listing.sourceListingKey,
          listing.standardStatus,
          listing.city,
          listing.stateOrProvince,
          listing.postalCode,
          listing.listPrice,
          listing.bedroomsTotal,
          listing.bathroomsTotal,
          listing.livingArea,
          JSON.stringify({ subdivision: listing.subdivision }),
          listing.county,
          listing.scopeKey,
          listing.propertyType,
          listing.propertySubType,
          listing.addressDisplay,
          listing.lotSizeAcres,
          listing.listOfficeName,
          listing.sourceModifiedAt,
          expiresAt,
        ),
        env.DB.prepare(
          `insert into listing_scope_membership
            (listing_id, scope_key, source_listing_key, first_seen_at, last_seen_at)
           values (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           on conflict(listing_id, scope_key) do update set
             source_listing_key = excluded.source_listing_key,
             last_seen_at = CURRENT_TIMESTAMP`,
        ).bind(listing.id, listing.scopeKey, listing.sourceListingKey),
      );
    }

    statements.push(
      env.DB.prepare(
        `insert into mls_sync_cursors
          (id, scope_key, resource_name, cursor_value, last_attempt_at,
           last_success_at, last_error, updated_at)
         values (?, ?, 'Property', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, null,
                 CURRENT_TIMESTAMP)
         on conflict(scope_key, resource_name) do update set
           cursor_value = excluded.cursor_value,
           last_attempt_at = CURRENT_TIMESTAMP,
           last_success_at = CURRENT_TIMESTAMP,
           last_error = null,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(`${scopeKey}:Property`, scopeKey, cursorAfter),
      env.DB.prepare(
        `update mls_sync_runs
            set status = 'succeeded', records_received = ?, records_written = ?,
                cursor_after = ?, completed_at = CURRENT_TIMESTAMP
          where id = ?`,
      ).bind(candidates.length, listings.length, cursorAfter, runId),
    );

    await env.DB.batch(statements);

    return {
      scopeKey,
      status: "succeeded",
      recordsReceived: candidates.length,
      recordsWritten: listings.length,
      cursorBefore,
      cursorAfter,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown MLS synchronization error.";
    await env.DB.batch([
      env.DB.prepare(
        `insert into mls_sync_cursors
          (id, scope_key, resource_name, cursor_value, last_attempt_at,
           last_error, updated_at)
         values (?, ?, 'Property', ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
         on conflict(scope_key, resource_name) do update set
           last_attempt_at = CURRENT_TIMESTAMP,
           last_error = excluded.last_error,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        `${scopeKey}:Property`,
        scopeKey,
        cursorBefore,
        message.slice(0, 1_000),
      ),
      env.DB.prepare(
        `update mls_sync_runs
            set status = 'failed', error_code = 'MLS_SYNC_FAILED',
                error_message = ?, completed_at = CURRENT_TIMESTAMP
          where id = ?`,
      ).bind(message.slice(0, 1_000), runId),
    ]);

    return {
      scopeKey,
      status: "failed",
      recordsReceived: 0,
      recordsWritten: 0,
      cursorBefore,
      cursorAfter: cursorBefore,
      error: message,
    };
  }
}

export async function syncAllActiveIdxScopes(env: MlsSyncEnv) {
  const results: MlsSyncResult[] = [];
  for (const county of ["washington", "iron"] as const) {
    results.push(await syncMlsPropertyCache(env, county));
  }
  return results;
}
