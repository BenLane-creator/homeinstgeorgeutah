import { useEffect, useMemo, useState } from "react";

type ListingCard = {
  listingId: string;
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

type SearchResponse = {
  ok: boolean;
  data?: {
    mode?: "stub" | "live";
    listings?: ListingCard[];
    warnings?: string[];
    pagination?: {
      page: number;
      limit: number;
      count: number;
    };
  };
  error?: {
    message: string;
  };
};

function dollars(value: number | null) {
  if (value === null) return "Price available through MLS";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function SearchResultsIsland() {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [listings, setListings] = useState<ListingCard[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const query = useMemo(() => {
    if (typeof window === "undefined") return "limit=6";
    const params = new URLSearchParams(window.location.search);
    if (!params.has("limit")) params.set("limit", "6");
    return params.toString();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function runSearch() {
      setState("loading");
      try {
        const response = await fetch(`/api/v1/search/execute?${query}`, {
          headers: { accept: "application/json" },
        });
        const payload = (await response.json()) as SearchResponse;

        if (cancelled) return;

        if (!payload.ok) {
          setMessage(payload.error?.message ?? "Search failed.");
          setState("error");
          return;
        }

        setListings(payload.data?.listings ?? []);
        setWarnings(payload.data?.warnings ?? []);
        setMessage(
          payload.data?.mode === "stub"
            ? "Spark/RESO credentials are not configured yet. Showing the empty safe-state."
            : "",
        );
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Search failed.");
        setState("error");
      }
    }

    runSearch();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="mt-10 rounded-3xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-900/70">
            Live Source Layer output
          </p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-stone-950">
            Search results
          </h2>
        </div>
        <p className="text-sm text-stone-500">
          Frontend receives normalized DTOs, not raw MLS payloads.
        </p>
      </div>

      {state === "loading" && (
        <p className="mt-6 text-stone-600">Loading search results…</p>
      )}
      {message && (
        <p className="mt-6 rounded-2xl bg-[#fffaf3] p-4 text-sm font-semibold text-stone-700">
          {message}
        </p>
      )}

      {state === "ready" && listings.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 p-6 text-stone-600">
          No listings returned yet. Configure Spark/RESO credentials and confirm
          display rules before enabling production MLS results.
        </div>
      )}

      {listings.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {listings.map((listing) => (
            <article
              key={listing.listingId}
              className="overflow-hidden rounded-3xl border border-stone-200 bg-white"
            >
              <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 text-sm font-semibold text-stone-500">
                {listing.primaryPhotoUrl ? (
                  <img
                    src={listing.primaryPhotoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "Photo governed by MLS media rights"
                )}
              </div>
              <div className="p-5">
                <p className="text-xl font-semibold text-stone-950">
                  {dollars(listing.price)}
                </p>
                <h3 className="mt-2 font-semibold text-stone-800">
                  {listing.addressDisplay}
                </h3>
                <p className="mt-1 text-sm text-stone-600">
                  {[listing.city, listing.state, listing.postalCode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p className="mt-4 text-sm text-stone-700">
                  {[
                    listing.beds !== null ? `${listing.beds} beds` : null,
                    listing.baths !== null ? `${listing.baths} baths` : null,
                    listing.livingArea !== null
                      ? `${listing.livingArea.toLocaleString()} sq ft`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-4 text-xs leading-5 text-stone-500">
                  {listing.attribution}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-6 rounded-2xl bg-stone-50 p-4 text-xs leading-5 text-stone-600">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
    </div>
  );
}
