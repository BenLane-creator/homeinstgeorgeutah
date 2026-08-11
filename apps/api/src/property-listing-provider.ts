export type ViewerState =
  | "public"
  | "registered"
  | "vow_accepted"
  | "broker_admin";
export type ListingAgreementScope = "idx" | "vow" | "broker_back_office";

export type ViewerContext = {
  state: ViewerState;
  agreementScope?: ListingAgreementScope;
  userAccountId?: string;
  contactId?: string;
  acceptedTerms?: string[];
};

export type ConsumerContext = {
  userAccountId: string;
  contactId?: string;
  viewer: ViewerContext;
};

export type ListingSearchInput = {
  q?: string;
  city?: string;
  neighborhood?: string;
  minPrice?: number;
  maxPrice?: number;
  beds?: number;
  baths?: number;
  propertyType?: string;
  status?: string;
  page: number;
  limit: number;
  viewer?: ViewerContext;
};

export type ListingSearchResult = {
  count?: number;
  page: number;
  limit: number;
  results: PublicListingCard[];
  source: "stub" | "live";
  provider: string;
  warnings: string[];
};

export type PublicListingCard = {
  listingId: string;
  listingKey: string;
  status: string | null;
  price: number | null;
  propertyType: string | null;
  propertySubType: string | null;
  addressDisplay: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  beds: number | null;
  baths: number | null;
  livingArea: number | null;
  primaryPhotoUrl: string | null;
  attribution: string;
  updatedAt: string | null;
  requiredDisclaimers: string[];
};

export type PublicListingDetail = PublicListingCard & {
  publicRemarks: string | null;
  lotSizeSquareFeet: number | null;
  yearBuilt: number | null;
  latitude: number | null;
  longitude: number | null;
  officeName: string | null;
  agentName: string | null;
  media: ListingMedia[];
  openHouses: ListingOpenHouse[];
};

export type Listing = PublicListingDetail;
export type ListingMedia = {
  url: string;
  mediaType: string | null;
  sortOrder: number | null;
  attribution: string | null;
};
export type ListingOpenHouse = {
  startAt: string;
  endAt: string | null;
  remarks: string | null;
};
export type SimilarListingsInput = ListingSearchInput & { listingId: string };
export type ListingSyncCursorInput = { cursor?: string; limit?: number };
export type ListingSyncResult = {
  nextCursor?: string;
  changed: number;
  raw?: unknown;
};
export type SavedSearchRecord = Record<string, unknown>;
export type SavedListingRecord = Record<string, unknown>;

export type ListingProvider = {
  search(input: ListingSearchInput): Promise<ListingSearchResult>;
  getById(listingId: string, viewer?: ViewerContext): Promise<Listing | null>;
  getMedia(listingId: string, viewer?: ViewerContext): Promise<ListingMedia[]>;
  getOpenHouses(listingId: string): Promise<ListingOpenHouse[]>;
  getSimilar(input: SimilarListingsInput): Promise<ListingSearchResult>;
  getSavedSearches?(input: ConsumerContext): Promise<SavedSearchRecord[]>;
  getSavedListings?(input: ConsumerContext): Promise<SavedListingRecord[]>;
  sync(input: ListingSyncCursorInput): Promise<ListingSyncResult>;
};

export const publicViewer: ViewerContext = {
  state: "public",
  agreementScope: "idx",
};
