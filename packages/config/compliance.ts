export type UserDisplayState =
  | "public"
  | "registered"
  | "vow_accepted"
  | "broker_admin";
export type ListingAgreementScope = "idx" | "vow" | "broker_back_office";

export type ListingDisplayPolicyInput = {
  fieldName: string;
  userState: UserDisplayState;
  agreementScope?: ListingAgreementScope;
  policyVersion?: string;
};

export const APPROVED_IDX_POLICY_VERSION = "washington-county-idx-v1";

const publicIdxFields = new Set([
  "ListingId",
  "ListingKey",
  "StandardStatus",
  "PropertyType",
  "PropertySubType",
  "ListPrice",
  "StreetNumber",
  "StreetName",
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
  "PhotosCount",
  "ModificationTimestamp",
  "ListOfficeName",
  "ListAgentFullName",
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
  policyVersion,
}: ListingDisplayPolicyInput) {
  if (policyVersion !== APPROVED_IDX_POLICY_VERSION) return false;
  if (userState === "broker_admin") return true;
  if (agreementScope === "broker_back_office") return false;
  if (publicIdxFields.has(fieldName)) return true;
  if (registeredOnlyFields.has(fieldName))
    return userState === "registered" || userState === "vow_accepted";
  if (agreementScope === "vow") return userState === "vow_accepted";
  return false;
}

export function requiresRegistration(fieldName: string) {
  return registeredOnlyFields.has(fieldName);
}

export function canDisplayMedia(input: {
  listingStatus?: string;
  userState: UserDisplayState;
  mediaRightsAllowed?: boolean;
  policyVersion?: string;
}) {
  if (input.policyVersion !== APPROVED_IDX_POLICY_VERSION) return false;
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
  provider = "the authorized Washington County listing feed",
) {
  return [
    `Listing data is provided through ${provider}.`,
    "Display fields, media, attribution, update timestamps, and registered-user gating must follow the applicable MLS/provider agreement.",
    "The website does not scrape, copy, or re-host MLS listing content outside approved display permissions.",
  ];
}
