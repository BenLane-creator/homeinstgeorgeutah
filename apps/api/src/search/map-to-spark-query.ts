import type { ListingSearchInput } from "../property-listing-provider";

function escapeOData(value: string) {
  return value.replace(/'/g, "''");
}

export function mapToSparkQuery(input: ListingSearchInput) {
  const filters: string[] = [];

  if (input.status)
    filters.push(`StandardStatus eq '${escapeOData(input.status)}'`);
  if (input.city) filters.push(`City eq '${escapeOData(input.city)}'`);
  if (input.minPrice !== undefined)
    filters.push(`ListPrice ge ${input.minPrice}`);
  if (input.maxPrice !== undefined)
    filters.push(`ListPrice le ${input.maxPrice}`);
  if (input.beds !== undefined) filters.push(`BedroomsTotal ge ${input.beds}`);
  if (input.baths !== undefined)
    filters.push(`BathroomsTotalInteger ge ${input.baths}`);
  if (input.propertyType)
    filters.push(`PropertyType eq '${escapeOData(input.propertyType)}'`);

  const params: Record<string, string> = {
    $top: String(input.limit),
    $skip: String((input.page - 1) * input.limit),
    $orderby: "ModificationTimestamp desc",
    $select: [
      "ListingId",
      "ListingKey",
      "StandardStatus",
      "PropertyType",
      "PropertySubType",
      "ListPrice",
      "UnparsedAddress",
      "StreetNumber",
      "StreetName",
      "StreetSuffix",
      "City",
      "StateOrProvince",
      "PostalCode",
      "BedroomsTotal",
      "BathroomsTotalInteger",
      "LivingArea",
      "LotSizeSquareFeet",
      "YearBuilt",
      "PublicRemarks",
      "Latitude",
      "Longitude",
      "ModificationTimestamp",
      "ListOfficeName",
      "ListAgentFullName",
    ].join(","),
  };

  if (filters.length) params.$filter = filters.join(" and ");

  return params;
}
