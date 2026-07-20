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
  lotSizeAcres: number | null;
  primaryPhotoUrl: string | null;
  attribution: string;
  updatedAt: string | null;
  requiredDisclaimers: string[];
};

type SearchResponse = {
  ok: boolean;
  data?: {
    mode?: "stub" | "live";
    message?: string;
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

type RequestState = "idle" | "loading" | "ready" | "error";

const filterLabels: Record<string, string> = {
  q: "Search",
  city: "City",
  neighborhood: "Area",
  minPrice: "Min",
  maxPrice: "Max",
  beds: "Beds",
  baths: "Baths",
  propertyType: "Type",
};

function dollars(value: number | null) {
  if (value === null) return "Price available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number | null) {
  return value === null ? null : new Intl.NumberFormat("en-US").format(value);
}

function statusLabel(value: string | null) {
  if (!value) return null;
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function updatedLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export default function SearchResultsIsland() {
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [listings, setListings] = useState<ListingCard[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("limit")) params.set("limit", "12");
    setSort(params.get("sort") || "newest");
    setQuery(params.toString());
  }, []);

  useEffect(() => {
    if (!query) return;

    const controller = new AbortController();

    async function runSearch() {
      setRequestState("loading");
      setMessage("");

      try {
        const response = await fetch(`/api/search?${query}`, {
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json()) as SearchResponse;

        if (!response.ok || !payload.ok) {
          setMessage(
            payload.error?.message ||
              "Live listings are temporarily unavailable. Please try again.",
          );
          setRequestState("error");
          return;
        }

        setListings(payload.data?.listings ?? []);
        setWarnings(payload.data?.warnings ?? []);
        setMessage(payload.data?.message ?? "");
        setRequestState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "Live listings are temporarily unavailable.",
        );
        setRequestState("error");
      }
    }

    runSearch();

    return () => controller.abort();
  }, [query]);

  const sortedListings = useMemo(() => {
    const next = [...listings];

    if (sort === "price-asc") {
      return next.sort(
        (a, b) =>
          (a.price ?? Number.POSITIVE_INFINITY) -
          (b.price ?? Number.POSITIVE_INFINITY),
      );
    }

    if (sort === "price-desc") {
      return next.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    }

    if (sort === "beds") {
      return next.sort((a, b) => (b.beds ?? -1) - (a.beds ?? -1));
    }

    if (sort === "sqft") {
      return next.sort((a, b) => (b.livingArea ?? -1) - (a.livingArea ?? -1));
    }

    return next;
  }, [listings, sort]);

  const activeFilters = useMemo(() => {
    if (!query) return [];
    const params = new URLSearchParams(query);

    return [...params.entries()]
      .filter(([key, value]) => filterLabels[key] && value)
      .map(([key, value]) => ({
        key,
        label: `${filterLabels[key]}: ${value}`,
      }));
  }, [query]);

  function changeSort(nextSort: string) {
    const url = new URL(window.location.href);
    if (nextSort === "newest") url.searchParams.delete("sort");
    else url.searchParams.set("sort", nextSort);
    window.location.assign(url.toString());
  }

  function removeFilter(key: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete(key);
    window.location.assign(url.toString());
  }

  return (
    <section className="mt-10" aria-labelledby="listing-results-title">
      <div className="flex flex-col gap-5 border-b border-stone-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--brand-gold)]">
            St. George and Southern Utah
          </p>
          <h2
            id="listing-results-title"
            className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[var(--brand-ink)] sm:text-4xl"
          >
            {requestState === "loading"
              ? "Finding homes…"
              : `${sortedListings.length} ${sortedListings.length === 1 ? "home" : "homes"}`}
          </h2>
        </div>

        <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-stone-600">
          Sort listings
          <select
            value={sort}
            onChange={(event) => changeSort(event.target.value)}
            className="min-h-12 min-w-52 border border-stone-300 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-[var(--brand-ink)]"
          >
            <option value="newest">Newest listings</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="beds">Most bedrooms</option>
            <option value="sqft">Most square feet</option>
          </select>
        </label>
      </div>

      {activeFilters.length > 0 && (
        <fieldset className="flex flex-wrap gap-2 border-b border-stone-200 py-4">
          <legend className="sr-only">Active search filters</legend>
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => removeFilter(filter.key)}
              className="inline-flex min-h-10 items-center gap-2 border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:border-[var(--brand-gold)]"
              aria-label={`Remove ${filter.label} filter`}
            >
              {filter.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </fieldset>
      )}

      <div aria-live="polite" aria-busy={requestState === "loading"}>
        {requestState === "loading" && (
          <div className="grid gap-6 py-8 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="overflow-hidden border border-stone-200 bg-white"
              >
                <div className="aspect-[4/3] animate-pulse bg-stone-200" />
                <div className="space-y-3 p-5">
                  <div className="h-7 w-2/5 animate-pulse bg-stone-200" />
                  <div className="h-4 w-3/5 animate-pulse bg-stone-100" />
                  <div className="h-4 w-4/5 animate-pulse bg-stone-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {requestState === "error" && (
          <div
            role="alert"
            className="my-8 border border-red-200 bg-red-50 px-6 py-8 sm:px-8"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-800">
              Search temporarily unavailable
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-[var(--brand-ink)]">
              Joel can provide current availability directly.
            </h3>
            <p className="mt-3 max-w-2xl leading-7 text-stone-700">{message}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-12 bg-[var(--brand-ink)] px-6 text-sm font-bold uppercase tracking-[0.12em] text-white"
              >
                Try again
              </button>
              <a
                href="/contact/?intent=buyer_active_search"
                className="inline-flex min-h-12 items-center justify-center border border-stone-300 bg-white px-6 text-sm font-bold uppercase tracking-[0.12em] text-[var(--brand-ink)]"
              >
                Ask Joel
              </a>
            </div>
          </div>
        )}

        {requestState === "ready" && sortedListings.length === 0 && (
          <div className="my-8 grid gap-8 border border-stone-200 bg-[var(--brand-warm-ivory)] px-6 py-10 sm:px-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
                Personalized search
              </p>
              <h3 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[var(--brand-ink)]">
                Let Joel find the right opportunities.
              </h3>
              <p className="mt-4 max-w-2xl leading-8 text-stone-700">
                {message ||
                  "No homes matched these filters. Adjust your search or share what you want with Joel for a property-specific local search."}
              </p>
            </div>
            <a
              href="/contact/?intent=buyer_active_search"
              className="inline-flex min-h-14 items-center justify-center bg-[var(--brand-ink)] px-7 text-sm font-bold uppercase tracking-[0.14em] text-white"
            >
              Start a custom search
            </a>
          </div>
        )}

        {sortedListings.length > 0 && (
          <div className="grid gap-6 py-8 sm:grid-cols-2 xl:grid-cols-3">
            {sortedListings.map((listing) => {
              const status = statusLabel(listing.status);
              const updated = updatedLabel(listing.updatedAt);
              const location = [listing.city, listing.state, listing.postalCode]
                .filter(Boolean)
                .join(", ");
              const detailsHref = `/contact/?intent=property_inquiry&listingId=${encodeURIComponent(listing.listingId)}&propertyAddress=${encodeURIComponent(listing.addressDisplay)}`;

              return (
                <article
                  key={listing.listingId}
                  className="group overflow-hidden border border-stone-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-stone-900/10"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
                    {listing.primaryPhotoUrl ? (
                      <img
                        src={listing.primaryPhotoUrl}
                        alt={listing.addressDisplay}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-8 text-center text-sm font-semibold text-stone-500">
                        Property photography available through the MLS
                      </div>
                    )}

                    {status && (
                      <span className="absolute left-3 top-3 bg-white px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--brand-ink)] shadow-sm">
                        {status}
                      </span>
                    )}
                  </div>

                  <div className="p-5 sm:p-6">
                    <p className="text-2xl font-semibold tracking-[-0.025em] text-[var(--brand-ink)]">
                      {dollars(listing.price)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-stone-700">
                      {listing.beds !== null && <span>{listing.beds} beds</span>}
                      {listing.baths !== null && (
                        <span>{listing.baths} baths</span>
                      )}
                      {listing.livingArea !== null && (
                        <span>{number(listing.livingArea)} sq ft</span>
                      )}
                      {listing.lotSizeAcres !== null && (
                        <span>{listing.lotSizeAcres} acres</span>
                      )}
                    </div>

                    <h3 className="mt-4 font-semibold text-[var(--brand-ink)]">
                      {listing.addressDisplay}
                    </h3>
                    {location && (
                      <p className="mt-1 text-sm text-stone-600">{location}</p>
                    )}

                    <div className="mt-5 border-t border-stone-200 pt-4">
                      <p className="text-xs leading-5 text-stone-500">
                        Listed by {listing.attribution}
                        {updated ? ` · Updated ${updated}` : ""}
                      </p>
                      <a
                        href={detailsHref}
                        className="mt-4 inline-flex min-h-11 items-center text-sm font-bold uppercase tracking-[0.12em] text-[var(--brand-ink)] hover:text-[var(--brand-deep-olive)]"
                      >
                        Request property details
                        <span aria-hidden="true" className="ml-3 text-[var(--brand-gold)]">
                          →
                        </span>
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="border-t border-stone-200 py-5 text-xs leading-6 text-stone-600">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
