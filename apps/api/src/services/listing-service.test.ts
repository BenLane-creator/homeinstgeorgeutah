import { describe, expect, test } from "bun:test";
import {
  APPROVED_POLICY_VERSION,
  buildProviderSearchParams,
  getMlsActivationState,
  sanitizeSearchParams,
  searchListings,
} from "./listing-service";

describe("MLS activation", () => {
  test("credentials alone never activate listing access", () => {
    expect(
      getMlsActivationState({
        SPARK_API_BASE_URL: "https://example.com/reso",
        SPARK_ACCESS_TOKEN: "secret",
      }).active,
    ).toBe(false);
  });

  test("requires the explicit flag, approved policy, provider, and credentials", () => {
    expect(
      getMlsActivationState({
        MLS_ACTIVATION_ENABLED: "true",
        MLS_POLICY_VERSION: APPROVED_POLICY_VERSION,
        LISTING_PROVIDER: "spark-reso",
        SPARK_API_BASE_URL: "https://example.com/reso",
        SPARK_ACCESS_TOKEN: "secret",
      }).active,
    ).toBe(true);
  });

  test("returns an honest disabled state without calling the provider", async () => {
    const result = await searchListings(
      {
        SPARK_API_BASE_URL: "https://example.com/reso",
        SPARK_ACCESS_TOKEN: "secret",
      },
      sanitizeSearchParams(new URL("https://example.com/api/search")),
    );

    expect(result.mode).toBe("disabled");
    expect(result.listings).toEqual([]);
  });
});

describe("search policy", () => {
  test("rejects non-active status and unknown parameters", () => {
    expect(() =>
      sanitizeSearchParams(
        new URL("https://example.com/api/search?status=Closed"),
      ),
    ).toThrow();
    expect(() =>
      sanitizeSearchParams(
        new URL("https://example.com/api/search?debug=true"),
      ),
    ).toThrow();
  });

  test("maps every supported sort to the provider order", () => {
    const params = sanitizeSearchParams(
      new URL("https://example.com/api/search?sort=price-asc&page=2&limit=12"),
    );
    const provider = buildProviderSearchParams(params);

    expect(provider.$orderby).toBe("ListPrice asc");
    expect(provider.$skip).toBe("12");
    expect(provider.$select).not.toContain("Media");
  });
});
