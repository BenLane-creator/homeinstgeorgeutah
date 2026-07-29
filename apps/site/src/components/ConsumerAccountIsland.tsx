import { useCallback, useEffect, useMemo, useState } from "react";

type ScopeState = {
  key: string;
  countyLabel: string;
  active: boolean;
  approvalStatus: string;
};

type Account = {
  email: string;
  displayName: string;
  scopes: string[];
  expiresAt: string;
};

type SavedHome = {
  id: string;
  listing_id: string;
  address_display?: string | null;
  city?: string | null;
  state_or_province?: string | null;
  list_price?: number | null;
  bedrooms_total?: number | null;
  bathrooms_total?: number | null;
};

type SavedSearch = {
  id: string;
  name: string;
  query: Record<string, string>;
  alertFrequency: string;
  updatedAt: string;
};

type LoadState = "loading" | "ready" | "error";

function dollars(value?: number | null) {
  if (value === null || value === undefined) return "Price available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function scopeLabel(key: string) {
  return key === "washington-vow"
    ? "Washington County VOW"
    : key === "iron-vow"
      ? "Iron County VOW"
      : key;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json", ...init?.headers },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok || payload.ok === false || !payload.data) {
    throw new Error(payload.error?.message || "The account request failed.");
  }
  return payload.data;
}

export default function ConsumerAccountIsland() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [scopes, setScopes] = useState<ScopeState[]>([]);
  const [homes, setHomes] = useState<SavedHome[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  const load = useCallback(async () => {
    setLoadState("loading");
    setMessage("");
    try {
      const [sessionData, mlsData] = await Promise.all([
        api<{ authenticated: boolean; account: Account | null }>(
          "/api/v1/session",
        ),
        api<{ scopes: ScopeState[] }>("/api/mls-status"),
      ]);
      setScopes(mlsData.scopes.filter((scope) => scope.key.endsWith("-vow")));
      setAccount(sessionData.authenticated ? sessionData.account : null);
      if (sessionData.authenticated && sessionData.account) {
        const [homesData, searchesData] = await Promise.all([
          api<{ homes: SavedHome[] }>("/api/v1/saved-homes"),
          api<{ searches: SavedSearch[] }>("/api/v1/saved-searches"),
        ]);
        setHomes(homesData.homes);
        setSearches(searchesData.searches);
      } else {
        setHomes([]);
        setSearches([]);
      }
      setLoadState("ready");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The account service is temporarily unavailable.",
      );
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeScopes = useMemo(
    () => new Set(scopes.filter((scope) => scope.active).map((scope) => scope.key)),
    [scopes],
  );

  async function logout() {
    setMessage("");
    try {
      await api<{ authenticated: false }>("/api/v1/session/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      setAccount(null);
      setHomes([]);
      setSearches([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign out failed.");
    }
  }

  async function removeHome(id: string) {
    const response = await fetch(`/api/v1/saved-homes/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!response.ok) {
      setMessage("The saved home could not be removed.");
      return;
    }
    setHomes((current) => current.filter((home) => home.id !== id));
  }

  async function removeSearch(id: string) {
    const response = await fetch(
      `/api/v1/saved-searches/${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "same-origin" },
    );
    if (!response.ok) {
      setMessage("The saved search could not be removed.");
      return;
    }
    setSearches((current) => current.filter((search) => search.id !== id));
  }

  if (loadState === "loading") {
    return (
      <div className="border border-stone-200 bg-white p-8" aria-live="polite">
        <p className="text-sm font-semibold text-stone-600">Loading account status…</p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="border border-red-200 bg-red-50 p-8" role="alert">
        <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">
          Account service unavailable
        </h2>
        <p className="mt-3 leading-7 text-stone-700">{message}</p>
        <button
          type="button"
          onClick={load}
          className="mt-6 min-h-12 bg-[var(--brand-ink)] px-6 text-sm font-bold uppercase tracking-[0.12em] text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!account) {
    return (
      <section aria-labelledby="consumer-sign-in-title">
        <div className="border border-stone-200 bg-white p-7 shadow-xl shadow-stone-900/5 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
            Consumer account
          </p>
          <h2
            id="consumer-sign-in-title"
            className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[var(--brand-ink)]"
          >
            Sign in through the authorized MLS scope.
          </h2>
          <p className="mt-4 max-w-3xl leading-8 text-stone-700">
            Washington County and Iron County access are approved and activated independently.
            A county button remains unavailable until its VOW authorization, production endpoints,
            credentials, and policy gate are complete.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {scopes.map((scope) => {
              const county = scope.key.startsWith("washington")
                ? "washington"
                : "iron";
              const active = activeScopes.has(scope.key);
              return (
                <article key={scope.key} className="border border-stone-200 p-6">
                  <h3 className="text-xl font-semibold text-[var(--brand-ink)]">
                    {scope.countyLabel}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Status: {active ? "Available" : "Pending activation"}
                  </p>
                  {active ? (
                    <a
                      href={`/api/v1/auth/flexmls/start?county=${county}&returnTo=/account/`}
                      className="mt-5 inline-flex min-h-12 items-center justify-center bg-[var(--brand-ink)] px-6 text-sm font-bold uppercase tracking-[0.12em] text-white"
                    >
                      Sign in to {scope.countyLabel}
                    </a>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="mt-5 inline-flex min-h-12 items-center justify-center border border-stone-300 bg-stone-100 px-6 text-sm font-bold uppercase tracking-[0.12em] text-stone-500"
                    >
                      Authorization pending
                    </span>
                  )}
                </article>
              );
            })}
          </div>

          <p className="mt-7 text-sm leading-7 text-stone-600">
            No account is created and no MLS authorization request is sent while the scope is inactive.
            Contact Joel for a tailored search in the meantime.
          </p>
          <a
            href="/contact/?intent=buyer_active_search"
            className="mt-5 inline-flex min-h-11 items-center font-bold text-[var(--brand-ink)] underline decoration-[var(--brand-gold)] underline-offset-4"
          >
            Contact Joel
          </a>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="consumer-account-title">
      <div className="flex flex-col gap-5 border border-stone-200 bg-white p-7 shadow-xl shadow-stone-900/5 sm:flex-row sm:items-start sm:justify-between sm:p-9">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
            Signed in
          </p>
          <h2
            id="consumer-account-title"
            className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[var(--brand-ink)]"
          >
            {account.displayName}
          </h2>
          <p className="mt-2 text-stone-600">{account.email}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {account.scopes.map((scope) => (
              <span
                key={scope}
                className="border border-[var(--brand-pink-sand)] bg-[var(--brand-warm-ivory)] px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--brand-ink)]"
              >
                {scopeLabel(scope)}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="min-h-11 border border-stone-300 bg-white px-5 text-sm font-bold uppercase tracking-[0.12em] text-[var(--brand-ink)]"
        >
          Sign out
        </button>
      </div>

      {message && (
        <p className="mt-5 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800" role="alert">
          {message}
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section className="border border-stone-200 bg-white p-6 sm:p-8" aria-labelledby="saved-homes-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
                Property list
              </p>
              <h3 id="saved-homes-title" className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">
                Saved homes
              </h3>
            </div>
            <a href="/homes/search/" className="text-sm font-bold text-[var(--brand-ink)] underline underline-offset-4">
              Search homes
            </a>
          </div>
          {homes.length === 0 ? (
            <p className="mt-6 leading-7 text-stone-600">No homes have been saved yet.</p>
          ) : (
            <ul className="mt-6 grid gap-4">
              {homes.map((home) => (
                <li key={home.id} className="border border-stone-200 p-5">
                  <p className="font-semibold text-[var(--brand-ink)]">
                    {home.address_display || home.listing_id}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    {[home.city, home.state_or_province].filter(Boolean).join(", ")} · {dollars(home.list_price)}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeHome(home.id)}
                    className="mt-4 text-sm font-bold text-[var(--brand-ink)] underline underline-offset-4"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border border-stone-200 bg-white p-6 sm:p-8" aria-labelledby="saved-searches-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
                Search criteria
              </p>
              <h3 id="saved-searches-title" className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">
                Saved searches
              </h3>
            </div>
            <a href="/homes/search/" className="text-sm font-bold text-[var(--brand-ink)] underline underline-offset-4">
              New search
            </a>
          </div>
          {searches.length === 0 ? (
            <p className="mt-6 leading-7 text-stone-600">No searches have been saved yet.</p>
          ) : (
            <ul className="mt-6 grid gap-4">
              {searches.map((search) => (
                <li key={search.id} className="border border-stone-200 p-5">
                  <p className="font-semibold text-[var(--brand-ink)]">{search.name}</p>
                  <p className="mt-1 text-sm text-stone-600">
                    {scopeLabel(`${search.query.county || "washington"}-vow`)} · {search.alertFrequency}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeSearch(search.id)}
                    className="mt-4 text-sm font-bold text-[var(--brand-ink)] underline underline-offset-4"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
