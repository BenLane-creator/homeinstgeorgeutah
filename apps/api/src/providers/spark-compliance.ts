import type { ListingAgreementScope, ViewerState } from "../listing-provider";

export type ListingDisplayPolicyInput = {
  fieldName: string;
  userState: ViewerState;
  agreementScope?: ListingAgreementScope;
};

const publicIdxFields = new Set([
  "ListingId",
  "ListingKey",
  "StandardStatus",
  "PropertyType",
  "PropertySubType",
  "ListPrice",
  "StreetNumber",
  "StreetName",
  "StreetSuffix",
  "UnparsedAddress",
  "City",
  "StateOrProvince",
  "PostalCode",
  "BedroomsTotal",
  "BathroomsTotalInteger",
  "BathroomsTotalDecimal",
  "LivingArea",
  "LotSizeSquareFeet",
  "YearBuilt",
  "PublicRemarks",
  "Latitude",
  "Longitude",
  "PhotosCount",
  "ModificationTimestamp",
  "ListOfficeName",
  "ListAgentFullName",
  "Media",
]);

const registeredOnlyFields = new Set([
  "VirtualTourURLUnbranded",
  "ShowingInstructions",
  "AssociationFee",
  "AssociationFeeFrequency",
]);

export function canDisplayField({
  fieldName,
  userState,
  agreementScope = "idx",
}: ListingDisplayPolicyInput) {
  if (userState === "broker_admin") return true;
  if (agreementScope === "broker_back_office") return false;
  if (publicIdxFields.has(fieldName)) return true;
  if (registeredOnlyFields.has(fieldName))
    return userState === "registered" || userState === "vow_accepted";
  if (agreementScope === "vow") return userState === "vow_accepted";
  return false;
}

export function canDisplayMedia(input: {
  listingStatus?: string | null;
  userState: ViewerState;
  mediaRightsAllowed?: boolean;
}) {
  if (input.mediaRightsAllowed === false) return false;
  if (!input.listingStatus) return false;

  const status = input.listingStatus.toLowerCase();
  if (
    ["active", "coming soon", "pending", "active under contract"].includes(
      status,
    )
  )
    return true;

  return input.userState === "broker_admin";
}

export function requiredDisclaimers(
  provider = "Spark / RESO via approved Flexmls/FBS access",
) {
  return [
    `Listing data is provided through ${provider} and approved MLS access.`,
    "Display fields, media, attribution, update timestamps, registered-user gates, and VOW access must follow the applicable MLS/provider agreement.",
    "HomeInStGeorgeUtah.com owns the product experience, but does not exceed MLS/FBS display or authentication rights.",
  ];
}

export function complianceWarnings() {
  return [
    "Display policy is provisional until Washington County MLS, Iron County MLS, Spark role, and VOW permissions are confirmed.",
    "Do not persist raw MLS payloads or media unless caching/storage rights and refresh/removal cadence are confirmed.",
  ];
}
