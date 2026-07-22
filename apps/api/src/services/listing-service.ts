export interface ListingServiceEnv {
  MLS_ACTIVATION_ENABLED?: string;
  MLS_POLICY_VERSION?: string;
  LISTING_PROVIDER?: string;
  SPARK_API_BASE_URL?: string;
  SPARK_ACCESS_TOKEN?: string;
}

export const APPROVED_POLICY_VERSION = "washington-county-idx-v1";

export const providerMeta = {
  provider: "Washington County listing feed",
  source: "Provider-neutral RESO adapter",
  compliance: [
    "Live listing display remains disabled until written authorization and field rules are recorded.",
    "Only contract-approved listing fields may be displayed.",
    "Raw provider records, unapproved media, and Iron County listings are never displayed.",
  ],
};

type UnknownRecord = Record<string, unknown>;

export type SearchParams = {
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
};

export class SearchInputError extends Error {}

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

function listingCandidates(payload: unknown) {
  const root = asRecord(payload);
  const nestedD = root ? asRecord(root.d) : null;

  if (root && Array.isArray(root.value)) return root.value;
  if (root && Array.isArray(root.results)) return root.results;
  if (nestedD && Array.isArray(nestedD.results)) return nestedD.results;
  if (nestedD) return [nestedD];

  return [];
}

export function getMlsActivationState(
  env: ListingServiceEnv,
): MlsActivationState {
  const explicitlyEnabled = env.MLS_ACTIVATION_ENABLED === "true";
  const policyApproved = env.MLS_POLICY_VERSION === APPROVED_POLICY_VERSION;
  const providerConfigured = env.LISTING_PROVIDER === "spark-reso";
  const credentialsConfigured = Boolean(
    env.SPARK_API_BASE_URL && env.SPARK_ACCESS_TOKEN,
  );

  return {
    active:
      explicitlyEnabled &&
      policyApproved &&
      providerConfigured &&
      credentialsConfigured,
    explicitlyEnabled,
    policyApproved,
    providerConfigured,
    credentialsConfigured,
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

  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new SearchInputError(`Unsupported search parameter: ${key}.`);
    }
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
    {
      min: 0,
      max: 100_000_000,
      integer: true,
    },
  );
  const maxPrice = boundedNumber(
    url.searchParams.get("maxPrice"),
    "Maximum price",
    {
      min: 0,
      max: 100_000_000,
      integer: true,
    },
  );
  if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) {
    throw new SearchInputError("Minimum price cannot exceed maximum price.");
  }

  return {
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
  if (params.baths) {
    filters.push(`BathroomsTotalInteger ge ${params.baths}`);
  }

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

export function normalizeListings(payload: unknown) {
  return listingCandidates(payload)
    .map((item) => {
      const listing = asRecord(item);
      if (!listing) return null;

      const listingId = firstString(listing, ["ListingKey", "ListingId"]);
      if (!listingId) return null;

      return {
        listingId,
        status: firstString(listing, ["StandardStatus"]),
        price: firstNumber(listing, ["ListPrice"]),
        propertyType: firstString(listing, ["PropertyType"]),
        propertySubType: firstString(listing, ["PropertySubType"]),
        addressDisplay:
          firstString(listing, ["UnparsedAddress"]) || "Address unavailable",
        city: firstString(listing, ["City"]),
        state: firstString(listing, ["StateOrProvince"]),
        postalCode: firstString(listing, ["PostalCode"]),
        beds: firstNumber(listing, ["BedroomsTotal"]),
        baths: firstNumber(listing, ["BathroomsTotalInteger"]),
        livingArea: firstNumber(listing, ["LivingArea"]),
        lotSizeAcres: firstNumber(listing, ["LotSizeAcres"]),
        primaryPhotoUrl: null,
        attribution:
          firstString(listing, ["ListOfficeName"]) ||
          "Listing office unavailable",
        updatedAt: firstString(listing, ["ModificationTimestamp"]),
        requiredDisclaimers: providerMeta.compliance,
      };
    })
    .filter((listing) => listing !== null);
}

export async function searchListings(
  env: ListingServiceEnv,
  params: SearchParams,
) {
  const state = getMlsActivationState(env);
  if (!state.active) {
    return {
      mode: "disabled" as const,
      message:
        "Live home search is not available yet. Contact Joel for current availability and a tailored search.",
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

  const baseUrl = new URL(env.SPARK_API_BASE_URL as string);
  if (baseUrl.protocol !== "https:") {
    throw new Error("The listing provider URL must use HTTPS.");
  }

  const url = new URL(`${baseUrl.toString().replace(/\/$/, "")}/Property`);
  for (const [key, value] of Object.entries(
    buildProviderSearchParams(params),
  )) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${env.SPARK_ACCESS_TOKEN}`,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Listing provider request failed with ${response.status}.`);
  }

  const payload: unknown = await response.json();
  const listings = normalizeListings(payload);
  const root = asRecord(payload);
  const total =
    (root && firstNumber(root, ["@odata.count"])) ?? listings.length;

  return {
    mode: "live" as const,
    query: params,
    listings,
    warnings: [],
    pagination: {
      page: Number(params.page),
      limit: Number(params.limit),
      count: listings.length,
      total,
    },
  };
}
