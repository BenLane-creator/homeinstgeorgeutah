import { describe, expect, test } from "bun:test";
import {
  buildProviderSearchParams,
  getMlsActivationState,
  sanitizeSearchParams,
  searchListings,
} from "./listing-service";
import { APPROVED_POLICY_VERSIONS } from "./mls-scope-service";

describe("MLS activation", () => {
  test("credentials alone never activate listing access", () => {
    expect(
      getMlsActivationState({
        WASHINGTON_IDX_API_BASE_URL: "https://example.com/reso",
        WASHINGTON_IDX_ACCESS_TOKEN: "secret",
      }).active,
    ).toBe(false);
  });

  test("requires the explicit county approval, policy, provider, and credentials", () => {
    expect(
      getMlsActivationState({
        WASHINGTON_IDX_APPROVAL_STATUS: "approved",
        WASHINGTON_IDX_ENABLED: "true",
        WASHINGTON_IDX_POLICY_VERSION:
          APPROVED_POLICY_VERSIONS.washington.idx,
        WASHINGTON_IDX_PROVIDER: "spark-reso",
        WASHINGTON_IDX_API_BASE_URL: "https://example.com/reso",
        WASHINGTON_IDX_ACCESS_TOKEN: "secret",
      }).active,
    ).toBe(true);
  });

  test("returns an honest disabled state without calling the provider", async () => {
    const result = await searchListings(
      {
        WASHINGTON_IDX_API_BASE_URL: "https://example.com/reso",
        WASHINGTON_IDX_ACCESS_TOKEN: "secret",
      },
      sanitizeSearchParams(new URL("https://example.com/api/search")),
    );

    expect(result.mode).toBe("disabled");
    expect(result.listings).toEqual([]);
  });

  test("keeps Washington and Iron activation independent", () => {
    const env = {
      IRON_IDX_APPROVAL_STATUS: "approved",
      IRON_IDX_ENABLED: "true",
      IRON_IDX_POLICY_VERSION: APPROVED_POLICY_VERSIONS.iron.idx,
      IRON_IDX_PROVIDER: "spark-reso",
      IRON_IDX_API_BASE_URL: "https://example.com/reso",
      IRON_IDX_ACCESS_TOKEN: "secret",
    };

    expect(getMlsActivationState(env, "iron").active).toBe(true);
    expect(getMlsActivationState(env, "washington").active).toBe(false);
  });
});

describe("search policy", () => {
  test("rejects non-active status, unknown counties, and unknown parameters", () => {
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
    expect(() =>
      sanitizeSearchParams(
        new URL("https://example.com/api/search?debug=true"),
      ),
    ).toThrow();
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

  test("maps every supported sort to the provider order", () => {
    const params = sanitizeSearchParams(
      new URL(
        "https://example.com/api/search?county=iron&sort=price-asc&page=2&limit=12",
      ),
    );
    const provider = buildProviderSearchParams(params);

    expect(provider.$orderby).toBe("ListPrice asc");
    expect(provider.$skip).toBe("12");
    expect(provider.$select).not.toContain("Media");
  });
});
