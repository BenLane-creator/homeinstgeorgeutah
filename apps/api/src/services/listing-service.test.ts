import { afterEach, describe, expect, test } from "bun:test";
import {
  buildCacheSearchQuery,
  buildProviderSearchParams,
  getMlsActivationState,
  sanitizeSearchParams,
  searchListings,
} from "./listing-service";
import { APPROVED_POLICY_VERSIONS } from "./mls-scope-service";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function emptyDb() {
  return {} as D1Database;
}

function activeIronEnv() {
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          return {
            async all() {
              return sql.includes("from listing_cache lc")
                ? {
                    results: [
                      {
                        id: "iron:listing-1",
                        source_listing_key: "listing-1",
                        standard_status: "Active",
                        list_price: 525000,
                        property_type: "Residential",
                        property_sub_type: "Single Family Residence",
                        address_display: "123 Cedar Way",
                        city: "Cedar City",
                        state_or_province: "UT",
                        postal_code: "84720",
                        bedrooms_total: 4,
                        bathrooms_total: 3,
                        living_area: 2400,
                        lot_size_acres: 0.25,
                        list_office_name: "Example Office",
                        source_modified_at: "2026-07-26T00:00:00Z",
                        last_synced_at: "2026-07-26T00:01:00Z",
                        primary_photo_url: null,
                      },
                    ],
                  }
                : { results: [] };
            },
            async first() {
              return sql.includes("count(*)") ? { total: 1 } : null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return {
    DB: db,
    IRON_IDX_APPROVAL_STATUS: "approved",
    IRON_IDX_ENABLED: "true",
    IRON_IDX_POLICY_VERSION: APPROVED_POLICY_VERSIONS.iron.idx,
    IRON_IDX_PROVIDER: "approved-reso-source",
    IRON_IDX_API_BASE_URL: "https://example.com/reso",
    IRON_IDX_ACCESS_TOKEN: "secret",
  };
}

describe("MLS activation", () => {
  test("credentials alone never activate listing access", () => {
    expect(
      getMlsActivationState({
        DB: emptyDb(),
        WASHINGTON_IDX_API_BASE_URL: "https://example.com/reso",
        WASHINGTON_IDX_ACCESS_TOKEN: "secret",
      }).active,
    ).toBe(false);
  });

  test("requires explicit county approval, policy, provider, and credentials", () => {
    expect(
      getMlsActivationState({
        DB: emptyDb(),
        WASHINGTON_IDX_APPROVAL_STATUS: "approved",
        WASHINGTON_IDX_ENABLED: "true",
        WASHINGTON_IDX_POLICY_VERSION: APPROVED_POLICY_VERSIONS.washington.idx,
        WASHINGTON_IDX_PROVIDER: "approved-reso-source",
        WASHINGTON_IDX_API_BASE_URL: "https://example.com/reso",
        WASHINGTON_IDX_ACCESS_TOKEN: "secret",
      }).active,
    ).toBe(true);
  });

  test("returns an honest disabled state without reading cache or provider", async () => {
    const result = await searchListings(
      {
        DB: emptyDb(),
        WASHINGTON_IDX_API_BASE_URL: "https://example.com/reso",
        WASHINGTON_IDX_ACCESS_TOKEN: "secret",
      },
      sanitizeSearchParams(new URL("https://example.com/api/search")),
    );

    expect(result.mode).toBe("disabled");
    expect(result.listings).toEqual([]);
  });

  test("keeps Washington and Iron activation independent", () => {
    const env = activeIronEnv();
    expect(getMlsActivationState(env, "iron").active).toBe(true);
    expect(getMlsActivationState(env, "washington").active).toBe(false);
  });
});

describe("search policy", () => {
  test("rejects non-active status and unknown counties", () => {
    expect(() =>
      sanitizeSearchParams(
        new URL("https://example.com/api/search?status=Closed"),
      ),
    ).toThrow();
    expect(() =>
      sanitizeSearchParams(
        new URL("https://example.com/api/search?county=cache"),
      ),
    ).toThrow();
  });

  test("ignores campaign and other non-search parameters", () => {
    const params = sanitizeSearchParams(
      new URL(
        "https://example.com/api/search?q=Ivins&utm_source=google&utm_campaign=spring&gclid=test-id",
      ),
    );

    expect(params.q).toBe("Ivins");
    expect(params.county).toBe("washington");
  });

  test("defaults to Washington and accepts Iron explicitly", () => {
    expect(
      sanitizeSearchParams(new URL("https://example.com/api/search")).county,
    ).toBe("washington");
    expect(
      sanitizeSearchParams(
        new URL("https://example.com/api/search?county=iron"),
      ).county,
    ).toBe("iron");
  });

  test("maps supported search inputs to parameterized cache SQL", () => {
    const params = sanitizeSearchParams(
      new URL(
        "https://example.com/api/search?county=iron&sort=price-asc&page=2&limit=12&city=Cedar%20City",
      ),
    );
    const cache = buildCacheSearchQuery(params);

    expect(cache.sql).toContain("from listing_cache lc");
    expect(cache.sql).toContain("lc.county_key = ?");
    expect(cache.sql).toContain("order by lc.list_price asc");
    expect(cache.values).toEqual(["iron", "Cedar City"]);
    expect(cache.offset).toBe(12);
  });

  test("public search reads the canonical cache and never calls the provider", async () => {
    globalThis.fetch = (async () => {
      throw new Error("provider must not be called by visitor search");
    }) as typeof fetch;

    const result = await searchListings(
      activeIronEnv(),
      sanitizeSearchParams(
        new URL("https://example.com/api/search?county=iron"),
      ),
    );

    expect(result.mode).toBe("cache");
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]?.listingId).toBe("iron:listing-1");
    expect(result.pagination.total).toBe(1);
  });

  test("keeps the upstream field allowlist free of media and private fields", () => {
    const params = sanitizeSearchParams(
      new URL("https://example.com/api/search?county=iron"),
    );
    const provider = buildProviderSearchParams(params);
    expect(provider.$select).not.toContain("Media");
    expect(provider.$select).not.toContain("Private");
  });
});
