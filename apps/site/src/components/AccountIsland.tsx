import { useEffect, useState } from "react";

type County = "washington" | "iron";

type MlsScope = {
  key: string;
  county: County;
  countyLabel: string;
  role: "idx" | "vow";
  approvalStatus: string;
  active: boolean;
};

type AccountData = {
  authenticated: boolean;
  account?: {
    email: string;
    fullName: string | null;
    sessionExpiresAt: string;
    grants: Array<{
      scope_key: string;
      status: string;
      access_expires_at: string | null;
      last_verified_at: string;
    }>;
  };
};

type SavedHome = {
  id: string;
  listing_id: string;
  source_listing_key: string | null;
  county_key: County | null;
  created_at: string;
};

type SavedSearch = {
  id: string;
  name: string;
  county_key: County | null;
  query_json: string;
  alert_frequency: string;
  status: string;
  created_at: string;
};

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
};

const countyLabels: Record<County, string> = {
  washington: "Washington County",
  iron: "Iron County",
};

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...init?.headers },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message || "The account request failed.");
  }
  return payload.data as T;
}

function displayQuery(value: string) {
  try {
    const query = JSON.parse(value) as Record<string, string>;
    return Object.entries(query)
      .filter(([, nested]) => nested)
      .map(([key, nested]) => `${key}: ${nested}`)
      .join(" · ");
  } catch {
    return "Saved criteria";
  }
}

export default function AccountIsland() {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountData>({ authenticated: false });
  const [scopes, setScopes] = useState<MlsScope[]>([]);
  const [savedHomes, setSavedHomes] = useState<SavedHome[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  async function refreshAccount() {
    const session = await api<AccountData>("/api/v1/account/session");
    setAccount(session);
    if (session.authenticated) {
      const [homes, searches] = await Promise.all([
        api<SavedHome[]>("/api/v1/account/saved-homes"),
        api<SavedSearch[]>("/api/v1/account/saved-searches"),
      ]);
      setSavedHomes(homes);
      setSavedSearches(searches);
    } else {
      setSavedHomes([]);
      setSavedSearches([]);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [status] = await Promise.all([
          api<{ scopes: MlsScope[] }>("/api/mls-status"),
          refreshAccount(),
        ]);
        setScopes(status.scopes);
        const params = new URLSearchParams(window.location.search);
        if (params.get("auth") === "success") {
          setFeedback("Account authorization completed.");
        } else if (params.get("auth") === "error") {
          setFeedback(
            "Account authorization was not completed. No MLS account data was activated.",
          );
        }
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Account unavailable.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function logout() {
    setSaving(true);
    setFeedback("");
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
      await refreshAccount();
      setFeedback("You are signed out.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Sign out failed.");
    } finally {
      setSaving(false);
    }
  }

  async function createSavedSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) || "").trim();
    try {
      await api("/api/v1/account/saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          county: value("county"),
          name: value("name"),
          alertFrequency: value("alertFrequency"),
          query: {
            q: value("q"),
            maxPrice: value("maxPrice"),
            beds: value("beds"),
          },
        }),
      });
      form.reset();
      await refreshAccount();
      setFeedback("Saved search created.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Search could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSavedHome(id: string) {
    setSaving(true);
    try {
      await api(`/api/v1/account/saved-homes/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await refreshAccount();
      setFeedback("Saved home removed.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Saved home could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSavedSearch(id: string) {
    setSaving(true);
    try {
      await api(`/api/v1/account/saved-searches/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await refreshAccount();
      setFeedback("Saved search removed.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Saved search could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  const vowScopes = scopes.filter((scope) => scope.role === "vow");

  if (loading) {
    return (
      <div className="border border-stone-200 bg-white p-8" aria-live="polite">
        Loading account status…
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      {feedback && (
        <div
          role="status"
          className="border border-stone-300 bg-white px-5 py-4 text-sm font-medium text-stone-700"
        >
          {feedback}
        </div>
      )}

      {!account.authenticated ? (
        <section className="border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
            Consumer account
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[var(--brand-ink)]">
            Authorize the county scope you use.
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-stone-600">
            Each county authorization is independent. Signing in does not activate another county or expose restricted data outside the approved scope.
          </p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            {(["washington", "iron"] as County[]).map((county) => {
              const scope = vowScopes.find((item) => item.county === county);
              return scope?.active ? (
                <a
                  key={county}
                  href={`/api/v1/auth/flexmls/start?county=${county}&redirect=/account/`}
                  className="inline-flex min-h-14 items-center justify-center bg-[var(--brand-ink)] px-6 text-sm font-bold uppercase tracking-[0.12em] text-white"
                >
                  Continue with {countyLabels[county]}
                </a>
              ) : (
                <div
                  key={county}
                  className="border border-stone-300 bg-stone-50 px-5 py-4"
                >
                  <p className="font-semibold text-[var(--brand-ink)]">
                    {countyLabels[county]}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    Account authorization is not active yet.
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-5 border border-stone-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand-gold)]">
                Signed in
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">
                {account.account?.fullName || account.account?.email}
              </h2>
              <p className="mt-1 text-sm text-stone-600">{account.account?.email}</p>
              <p className="mt-3 text-sm text-stone-600">
                Active scopes: {account.account?.grants.map((grant) => grant.scope_key).join(", ") || "None"}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={logout}
              className="min-h-12 border border-stone-300 px-6 text-sm font-bold uppercase tracking-[0.12em] text-[var(--brand-ink)] disabled:opacity-50"
            >
              Sign out
            </button>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="border border-stone-200 bg-white p-6 sm:p-8">
              <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Saved homes</h2>
              <div className="mt-5 grid gap-3">
                {savedHomes.length === 0 ? (
                  <p className="text-sm leading-7 text-stone-600">
                    No homes are saved. Use the save control on an authorized search result.
                  </p>
                ) : (
                  savedHomes.map((home) => (
                    <article key={home.id} className="border border-stone-200 p-4">
                      <p className="font-semibold text-[var(--brand-ink)]">{home.listing_id}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {home.county_key ? countyLabels[home.county_key] : "MLS scope"}
                      </p>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => removeSavedHome(home.id)}
                        className="mt-3 min-h-10 text-sm font-bold text-[var(--brand-ink)] underline underline-offset-4 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="border border-stone-200 bg-white p-6 sm:p-8">
              <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Saved searches</h2>
              <div className="mt-5 grid gap-3">
                {savedSearches.length === 0 ? (
                  <p className="text-sm leading-7 text-stone-600">No searches are saved.</p>
                ) : (
                  savedSearches.map((search) => (
                    <article key={search.id} className="border border-stone-200 p-4">
                      <p className="font-semibold text-[var(--brand-ink)]">{search.name}</p>
                      <p className="mt-1 text-sm leading-6 text-stone-600">
                        {displayQuery(search.query_json)}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.1em] text-stone-500">
                        Alerts: {search.alert_frequency}
                      </p>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => removeSavedSearch(search.id)}
                        className="mt-3 min-h-10 text-sm font-bold text-[var(--brand-ink)] underline underline-offset-4 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <form
            onSubmit={createSavedSearch}
            className="border border-stone-200 bg-white p-6 sm:p-8"
          >
            <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">Create a saved search</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-600">
                County
                <select name="county" className="min-h-12 border border-stone-300 bg-white px-3 text-base normal-case tracking-normal" required>
                  {account.account?.grants.map((grant) => {
                    const county = grant.scope_key.startsWith("iron") ? "iron" : "washington";
                    return <option key={grant.scope_key} value={county}>{countyLabels[county]}</option>;
                  })}
                </select>
              </label>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-600">
                Name
                <input name="name" className="min-h-12 border border-stone-300 px-3 text-base normal-case tracking-normal" required />
              </label>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-600">
                Keyword
                <input name="q" className="min-h-12 border border-stone-300 px-3 text-base normal-case tracking-normal" />
              </label>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-600">
                Maximum price
                <input name="maxPrice" inputMode="numeric" className="min-h-12 border border-stone-300 px-3 text-base normal-case tracking-normal" />
              </label>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-600">
                Alerts
                <select name="alertFrequency" className="min-h-12 border border-stone-300 bg-white px-3 text-base normal-case tracking-normal">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="off">Off</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-6 min-h-13 bg-[var(--brand-ink)] px-7 text-sm font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
            >
              Save search
            </button>
          </form>
        </>
      )}
    </div>
  );
}
