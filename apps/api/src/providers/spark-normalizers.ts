import type {
  ListingMedia,
  PublicListingCard,
  PublicListingDetail,
  ViewerContext,
} from "../property-listing-provider";
import { canDisplayMedia, requiredDisclaimers } from "./spark-compliance";
import type { SparkRawListing } from "./spark-types";

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstText(record: SparkRawListing, keys: string[]): string | null {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return null;
}

function firstNumber(record: SparkRawListing, keys: string[]): number | null {
  for (const key of keys) {
    const value = number(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function addressDisplay(record: SparkRawListing) {
  const unparsed = firstText(record, ["UnparsedAddress", "FullStreetAddress"]);
  if (unparsed) return unparsed;

  const parts = [
    firstText(record, ["StreetNumber"]),
    firstText(record, ["StreetName"]),
    firstText(record, ["StreetSuffix"]),
  ].filter(Boolean);
  return parts.length
    ? parts.join(" ")
    : "Address available through approved MLS display";
}

function mediaArray(record: SparkRawListing): ListingMedia[] {
  const media = record.Media;
  if (!Array.isArray(media)) return [];

  return media
    .map((item, index): ListingMedia | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      const url =
        text(candidate.MediaURL) ??
        text(candidate.MediaUrl) ??
        text(candidate.Url) ??
        text(candidate.uri);
      if (!url) return null;

      return {
        url,
        mediaType: text(candidate.MediaType),
        sortOrder:
          number(candidate.Order) ?? number(candidate.SortOrder) ?? index,
        attribution: text(candidate.ShortDescription) ?? null,
      };
    })
    .filter((item): item is ListingMedia => Boolean(item));
}

export function normalizeListingCard(
  record: SparkRawListing,
  viewer: ViewerContext,
  providerName: string,
): PublicListingCard {
  const status = firstText(record, ["StandardStatus", "MlsStatus"]);
  const mediaAllowed = canDisplayMedia({
    listingStatus: status,
    userState: viewer.state,
    mediaRightsAllowed: true,
  });
  const media = mediaAllowed ? mediaArray(record) : [];
  const officeName = firstText(record, ["ListOfficeName", "ListingOfficeName"]);

  return {
    listingId:
      firstText(record, ["ListingId", "MlsNumber", "Id"]) ??
      firstText(record, ["ListingKey"]) ??
      "unknown",
    listingKey:
      firstText(record, ["ListingKey", "ListingId", "Id"]) ?? "unknown",
    status,
    price: firstNumber(record, ["ListPrice", "CurrentPrice"]),
    propertyType: firstText(record, ["PropertyType"]),
    propertySubType: firstText(record, ["PropertySubType"]),
    addressDisplay: addressDisplay(record),
    city: firstText(record, ["City"]),
    state: firstText(record, ["StateOrProvince", "State"]),
    postalCode: firstText(record, ["PostalCode"]),
    beds: firstNumber(record, ["BedroomsTotal", "BedsTotal"]),
    baths: firstNumber(record, [
      "BathroomsTotalInteger",
      "BathroomsTotalDecimal",
      "BathsTotal",
    ]),
    livingArea: firstNumber(record, ["LivingArea", "BuildingAreaTotal"]),
    primaryPhotoUrl: media[0]?.url ?? null,
    attribution: officeName
      ? `Listing courtesy of ${officeName}`
      : providerName,
    updatedAt: firstText(record, [
      "ModificationTimestamp",
      "UpdateDate",
      "UpdatedAt",
    ]),
    requiredDisclaimers: requiredDisclaimers(providerName),
  };
}

export function normalizeListingDetail(
  record: SparkRawListing,
  viewer: ViewerContext,
  providerName: string,
): PublicListingDetail {
  const card = normalizeListingCard(record, viewer, providerName);
  const mediaAllowed = canDisplayMedia({
    listingStatus: card.status,
    userState: viewer.state,
    mediaRightsAllowed: true,
  });

  return {
    ...card,
    publicRemarks: firstText(record, ["PublicRemarks", "Remarks"]),
    lotSizeSquareFeet: firstNumber(record, ["LotSizeSquareFeet"]),
    yearBuilt: firstNumber(record, ["YearBuilt"]),
    latitude: firstNumber(record, ["Latitude"]),
    longitude: firstNumber(record, ["Longitude"]),
    officeName: firstText(record, ["ListOfficeName", "ListingOfficeName"]),
    agentName: firstText(record, ["ListAgentFullName", "ListAgentName"]),
    media: mediaAllowed ? mediaArray(record) : [],
    openHouses: [],
  };
}

export function extractListings(raw: unknown): SparkRawListing[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;

  if (Array.isArray(record.value))
    return record.value.filter((item): item is SparkRawListing =>
      Boolean(item && typeof item === "object"),
    );
  if (Array.isArray(record.Results))
    return record.Results.filter((item): item is SparkRawListing =>
      Boolean(item && typeof item === "object"),
    );

  const d = record.D;
  if (
    d &&
    typeof d === "object" &&
    Array.isArray((d as Record<string, unknown>).Results)
  ) {
    return ((d as Record<string, unknown>).Results as unknown[]).filter(
      (item): item is SparkRawListing =>
        Boolean(item && typeof item === "object"),
    );
  }

  return [record as SparkRawListing];
}
