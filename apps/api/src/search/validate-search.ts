import type { ListingSearchInput } from "../listing-provider";

function boundedPositiveInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function optionalNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseSearchInput(url: URL): ListingSearchInput {
  return {
    q: url.searchParams.get("q")?.trim() || undefined,
    city: url.searchParams.get("city")?.trim() || undefined,
    neighborhood: url.searchParams.get("neighborhood")?.trim() || undefined,
    minPrice: optionalNumber(url.searchParams.get("minPrice") ?? undefined),
    maxPrice: optionalNumber(url.searchParams.get("maxPrice") ?? undefined),
    beds: optionalNumber(url.searchParams.get("beds") ?? undefined),
    baths: optionalNumber(url.searchParams.get("baths") ?? undefined),
    propertyType: url.searchParams.get("propertyType")?.trim() || undefined,
    status: url.searchParams.get("status")?.trim() || "Active",
    page: boundedPositiveInt(
      url.searchParams.get("page") ?? undefined,
      1,
      1,
      10000,
    ),
    limit: boundedPositiveInt(
      url.searchParams.get("limit") ?? undefined,
      12,
      1,
      25,
    ),
  };
}
