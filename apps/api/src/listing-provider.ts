export type ListingSearchInput = Record<
  string,
  string | number | boolean | undefined
>;
export type ListingSearchResult = {
  count?: number;
  results: unknown[];
  raw?: unknown;
};
export type Listing = Record<string, unknown>;
export type ListingMedia = Record<string, unknown>;
export type ListingOpenHouse = Record<string, unknown>;
export type SimilarListingsInput = Record<
  string,
  string | number | boolean | undefined
>;
export type ListingSyncCursorInput = { cursor?: string; limit?: number };
export type ListingSyncResult = {
  nextCursor?: string;
  changed: number;
  raw?: unknown;
};
export type OfficeListingsInput = Record<
  string,
  string | number | boolean | undefined
>;
export type AgentListingsInput = Record<
  string,
  string | number | boolean | undefined
>;

export type ListingProvider = {
  search(input: ListingSearchInput): Promise<ListingSearchResult>;
  getById(listingId: string): Promise<Listing | null>;
  getMedia(listingId: string): Promise<ListingMedia[]>;
  getOpenHouses(listingId: string): Promise<ListingOpenHouse[]>;
  getSimilar(input: SimilarListingsInput): Promise<ListingSearchResult>;
  sync(input: ListingSyncCursorInput): Promise<ListingSyncResult>;
  getOfficeListings?(input: OfficeListingsInput): Promise<ListingSearchResult>;
  getAgentListings?(input: AgentListingsInput): Promise<ListingSearchResult>;
};
