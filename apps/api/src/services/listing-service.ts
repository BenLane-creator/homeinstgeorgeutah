import {
  APPROVED_POLICY_VERSIONS,
  getActiveIdxSource,
  getMlsScopeState,
  isMlsCounty,
  type MlsCounty,
  type MlsScopeEnv,
} from "./mls-scope-service";

export interface ListingServiceEnv extends MlsScopeEnv {
  DB: D1Database;
}

export const APPROVED_POLICY_VERSION = APPROVED_POLICY_VERSIONS.washington.idx;

export const LISTING_SCOPE = {
  counties: ["Washington", "Iron"],
  independentlyAuthorized: true,
  readModel: "canonical-d1-cache",
} as const;

export const providerMeta = {
  provider: "Washington and Iron County approved listing feeds",
  source: "Owned canonical D1 listing cache",
  compliance: [
    "Washington County and Iron County are independently authorized and activated.",
    "Only contract-approved listing fields and media may be displayed.",
    "Raw provider records and unapproved MLS scopes are never exposed to browsers.",
    "Visitor search reads only from the owned canonical cache; it never calls an MLS provider directly.",
  ],
};

export type SearchParams = {
  county: MlsCounty;
  q?: string;
  city?: string;
  neighborhood?: string;
  minPrice?: string;
  maxPrice?: string;
  beds?: string;
  baths?: string;
  propertyType?: string;
  status: "Active";
  sort: "newest" | "price-asc" | "price-desc" | "beds" | "sqft";
  page: string;
  limit: string;
};

export type MlsActivationState = {
  active: boolean;
  explicitlyEnabled: boolean;
  policyApproved: boolean;
  providerConfigured: boolean;
  credentialsConfigured: boolean;
  approvalStatus: string;
  county: MlsCounty;
};

export class SearchInputError extends Error {}

export function getMlsActivationState(
  env: ListingServiceEnv,
  county: MlsCounty = "washington",
): MlsActivationState {
  const state = getMlsScopeState(env, county, "idx");
  return {
    active: state.active,
    explicitlyEnabled: state.explicitlyEnabled,
    policyApproved: state.policyApproved,
    providerConfigured: state.providerConfigured,
    credentialsConfigured: state.credentialsConfigured,
    approvalStatus: state.approvalStatus,
    county,
  };
}

function boundedString(value: string | null, label: string, maxLength: number) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new SearchInputError(`${label} is too long.`);
  }
  return normalized;
}

function boundedNumber(
  value: string | null,
  label: string,
  options: { min: number; max: number; integer?: boolean },
) {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < options.min ||
    parsed > options.max ||
    (options.integer && !Number.isInteger(parsed))
  ) {
    throw new SearchInputError(`${label} is invalid.`);
  }
  return String(parsed);
}

export function sanitizeSearchParams(url: URL): SearchParams {
  const requestedCounty =
    url.searchParams.get("county")?.trim().toLowerCase() || "washington";
  if (!isMlsCounty(requestedCounty)) {
    throw new SearchInputError("County must be washington or iron.");
  }

  const requestedStatus = url.searchParams.get("status")?.trim() || "Active";
  if (requestedStatus !== "Active") {
    throw new SearchInputError("Only active listings may be requested.");
  }

  const requestedSort = url.searchParams.get("sort")?.trim() || "newest";
  const allowedSorts = new Set([
    "newest",
    "price-asc",
    "price-desc",
    "beds",
    "sqft",
  ]);
  if (!allowedSorts.has(requestedSort)) {
    throw new SearchInputError("Sort selection is invalid.");
  }

  const minPrice = boundedNumber(
    url.searchParams.get("minPrice"),
    "Minimum price",
    { min: 0, max: 100_000_000, integer: true },
  );
  const maxPrice = boundedNumber(
    url.searchParams.get("maxPrice"),
    "Maximum price",
    { min: 0, max: 100_000_000, integer: true },
  );
  if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) {
    throw new SearchInputError("Minimum price cannot exceed maximum price.");
  }

  return {
    county: requestedCounty,
    q: boundedString(url.searchParams.get("q"), "Search", 120),
    city: boundedString(url.searchParams.get("city"), "City", 80),
    neighborhood: boundedString(
      url.searchParams.get("neighborhood"),
      "Area",
      120,
    ),
    minPrice,
    maxPrice,
    beds: boundedNumber(url.searchParams.get("beds"), "Bedrooms", {
      min: 0,
      max: 20,
      integer: true,
    }),
    baths: boundedNumber(url.searchParams.get("baths"), "Bathrooms", {
      min: 0,
      max: 20,
    }),
    propertyType: boundedString(
      url.searchParams.get("propertyType"),
      "Property type",
      80,
    ),
    status: "Active",
    sort: requestedSort as SearchParams["sort"],
    page:
      boundedNumber(url.searchParams.get("page") || "1", "Page", {
        min: 1,
        max: 10_000,
        integer: true,
      }) || "1",
    limit:
      boundedNumber(url.searchParams.get("limit") || "12", "Limit", {
        min: 1,
        max: 25,
        integer: true,
      }) || "12",
  };
}

function escapeODataString(value: string) {
  return value.replace(/'/g, "''");
}

export function buildProviderSearchParams(params: SearchParams) {
  const filters = ["StandardStatus eq 'Active'"];

  if (params.city) filters.push(`City eq '${escapeODataString(params.city)}'`);
  if (params.neighborhood) {
    filters.push(
      `contains(SubdivisionName,'${escapeODataString(params.neighborhood)}')`,
    );
  }
  if (params.propertyType) {
    filters.push(`PropertyType eq '${escapeODataString(params.propertyType)}'`);
  }
  if (params.q) {
    const query = escapeODataString(params.q);
    filters.push(
      `(contains(UnparsedAddress,'${query}') or contains(City,'${query}') or contains(SubdivisionName,'${query}') or ListingId eq '${query}')`,
    );
  }
  if (params.minPrice) filters.push(`ListPrice ge ${params.minPrice}`);
  if (params.maxPrice) filters.push(`ListPrice le ${params.maxPrice}`);
  if (params.beds) filters.push(`BedroomsTotal ge ${params.beds}`);
  if (params.baths) filters.push(`BathroomsTotalInteger ge ${params.baths}`);

  const orderBy: Record<SearchParams["sort"], string> = {
    newest: "ModificationTimestamp desc",
    "price-asc": "ListPrice asc",
    "price-desc": "ListPrice desc",
    beds: "BedroomsTotal desc,ModificationTimestamp desc",
    sqft: "LivingArea desc,ModificationTimestamp desc",
  };

  return {
    $top: params.limit,
    $skip: String((Number(params.page) - 1) * Number(params.limit)),
    $count: "true",
    $orderby: orderBy[params.sort],
    $filter: filters.join(" and "),
    $select: [
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
  };
}

type CacheRow = {
  id: string;
  source_listing_key: string;
  standard_status: string | null;
  list_price: number | null;
  property_type: string | null;
  property_sub_type: string | null;
  address_display: string | null;
  city: string | null;
  state_or_province: string | null;
  postal_code: string | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
  living_area: number | null;
  lot_size_acres: number | null;
  list_office_name: string | null;
  source_modified_at: string | null;
  last_synced_at: string | null;
  primary_photo_url: string | null;
};

function buildCacheFilter(params: SearchParams) {
  const clauses = ["lc.county_key = ?", "lc.standard_status = 'Active'"];
  const values: unknown[] = [params.county];

  if (params.q) {
    clauses.push(
      `(lc.address_display like ? escape '\\' or lc.city like ? escape '\\' or lc.source_listing_key = ?)`,
    );
    const escaped = params.q.replace(/[\\%_]/g, "\\$&");
    values.push(`%${escaped}%`, `%${escaped}%`, params.q);
  }
  if (params.city) {
    clauses.push("lower(lc.city) = lower(?)");
    values.push(params.city);
  }
  if (params.neighborhood) {
    clauses.push(
      "lower(json_extract(lc.display_json, '$.subdivision')) like lower(?)",
    );
    values.push(`%${params.neighborhood}%`);
  }
  if (params.minPrice) {
    clauses.push("lc.list_price >= ?");
    values.push(Number(params.minPrice));
  }
  if (params.maxPrice) {
    clauses.push("lc.list_price <= ?");
    values.push(Number(params.maxPrice));
  }
  if (params.beds) {
    clauses.push("lc.bedrooms_total >= ?");
    values.push(Number(params.beds));
  }
  if (params.baths) {
    clauses.push("lc.bathrooms_total >= ?");
    values.push(Number(params.baths));
  }
  if (params.propertyType) {
    clauses.push("lower(lc.property_type) = lower(?)");
    values.push(params.propertyType);
  }

  return { where: clauses.join(" and "), values };
}

export function buildCacheSearchQuery(params: SearchParams) {
  const { where, values } = buildCacheFilter(params);
  const orderBy: Record<SearchParams["sort"], string> = {
    newest: "coalesce(lc.source_modified_at, lc.last_synced_at) desc",
    "price-asc": "lc.list_price asc, lc.id asc",
    "price-desc": "lc.list_price desc, lc.id asc",
    beds: "lc.bedrooms_total desc, lc.id asc",
    sqft: "lc.living_area desc, lc.id asc",
  };

  return {
    sql: `select lc.id, lc.source_listing_key, lc.standard_status, lc.list_price,
                 lc.property_type, lc.property_sub_type, lc.address_display,
                 lc.city, lc.state_or_province, lc.postal_code,
                 lc.bedrooms_total, lc.bathrooms_total, lc.living_area,
                 lc.lot_size_acres, lc.list_office_name, lc.source_modified_at,
                 lc.last_synced_at,
                 (select lm.media_url from listing_media lm
                   where lm.listing_id = lc.id
                   order by coalesce(lm.sort_order, 999999), lm.id limit 1)
                   as primary_photo_url
            from listing_cache lc
           where ${where}
           order by ${orderBy[params.sort]}
           limit ? offset ?`,
    countSql: `select count(*) as total from listing_cache lc where ${where}`,
    values,
    limit: Number(params.limit),
    offset: (Number(params.page) - 1) * Number(params.limit),
  };
}

export async function searchListings(
  env: ListingServiceEnv,
  params: SearchParams,
) {
  const source = getActiveIdxSource(env, params.county);
  if (!source) {
    const countyLabel =
      params.county === "washington" ? "Washington County" : "Iron County";
    return {
      mode: "disabled" as const,
      message: `Live ${countyLabel} home search is not available yet. Contact Joel for current availability and a tailored search.`,
      query: params,
      listings: [],
      warnings: [],
      pagination: {
        page: Number(params.page),
        limit: Number(params.limit),
        count: 0,
        total: 0,
      },
    };
  }

  const query = buildCacheSearchQuery(params);
  const [rows, count] = await Promise.all([
    env.DB.prepare(query.sql)
      .bind(...query.values, query.limit, query.offset)
      .all<CacheRow>(),
    env.DB.prepare(query.countSql)
      .bind(...query.values)
      .first<{ total: number }>(),
  ]);

  const listings = (rows.results || []).map((row) => ({
    listingId: row.id,
    sourceListingId: row.source_listing_key,
    mlsScope: params.county,
    status: row.standard_status,
    price: row.list_price,
    propertyType: row.property_type,
    propertySubType: row.property_sub_type,
    addressDisplay: row.address_display || "Address unavailable",
    city: row.city,
    state: row.state_or_province,
    postalCode: row.postal_code,
    beds: row.bedrooms_total,
    baths: row.bathrooms_total,
    livingArea: row.living_area,
    lotSizeAcres: row.lot_size_acres,
    primaryPhotoUrl: row.primary_photo_url,
    attribution: row.list_office_name || "Listing office unavailable",
    updatedAt: row.source_modified_at || row.last_synced_at,
    requiredDisclaimers: providerMeta.compliance,
  }));

  return {
    mode: "cache" as const,
    source: {
      county: source.county,
      provider: source.provider,
      readModel: "canonical-d1-cache",
    },
    message:
      listings.length === 0
        ? "No matching cached listings are currently available. Contact Joel for current availability and a tailored search."
        : undefined,
    query: params,
    listings,
    warnings: [],
    pagination: {
      page: Number(params.page),
      limit: Number(params.limit),
      count: listings.length,
      total: Number(count?.total || 0),
    },
  };
}
