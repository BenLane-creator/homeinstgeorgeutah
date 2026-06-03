import type { Listing, ListingMedia, ListingOpenHouse, ListingProvider, ListingSearchInput, ListingSearchResult, ListingSyncCursorInput, ListingSyncResult, SimilarListingsInput, ViewerContext } from "../listing-provider";
import { publicViewer } from "../listing-provider";
import { mapToSparkQuery } from "../search/map-to-spark-query";
import { complianceWarnings } from "./spark-compliance";
import { extractListings, normalizeListingCard, normalizeListingDetail } from "./spark-normalizers";
import type { SparkEnv } from "./spark-types";

async function requestSpark(env: SparkEnv, path: string, params?: Record<string, string>) {
  if (!env.SPARK_API_BASE_URL || !env.SPARK_ACCESS_TOKEN) return null;

  const base = env.SPARK_API_BASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}${path}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${env.SPARK_ACCESS_TOKEN}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Spark/RESO request failed with ${response.status}`);
  }

  return response.json();
}

export function createSparkResoProvider(env: SparkEnv): ListingProvider {
  const providerName = env.MLS_PROVIDER_NAME || "Washington + Iron MLS via Spark / RESO";

  return {
    async search(input: ListingSearchInput): Promise<ListingSearchResult> {
      const viewer = input.viewer ?? publicViewer;
      const raw = await requestSpark(env, "/Property", mapToSparkQuery(input));

      if (!raw) {
        return {
          count: 0,
          page: input.page,
          limit: input.limit,
          results: [],
          source: "stub",
          provider: providerName,
          warnings: complianceWarnings(),
        };
      }

      const listings = extractListings(raw).map((listing) => normalizeListingCard(listing, viewer, providerName));

      return {
        count: listings.length,
        page: input.page,
        limit: input.limit,
        results: listings,
        source: "live",
        provider: providerName,
        warnings: complianceWarnings(),
      };
    },

    async getById(listingId: string, viewer: ViewerContext = publicViewer): Promise<Listing | null> {
      const raw = await requestSpark(env, `/Property('${encodeURIComponent(listingId)}')`);
      if (!raw) return null;
      const [listing] = extractListings(raw);
      return listing ? normalizeListingDetail(listing, viewer, providerName) : null;
    },

    async getMedia(_listingId: string, _viewer: ViewerContext = publicViewer): Promise<ListingMedia[]> {
      return [];
    },

    async getOpenHouses(_listingId: string): Promise<ListingOpenHouse[]> {
      return [];
    },

    async getSimilar(input: SimilarListingsInput): Promise<ListingSearchResult> {
      return this.search(input);
    },

    async sync(_input: ListingSyncCursorInput): Promise<ListingSyncResult> {
      return { changed: 0 };
    },
  };
}
