const apex = "https://homeinstgeorgeutah.com";
const www = "https://www.homeinstgeorgeutah.com";

async function request(path, init = {}) {
  const response = await fetch(`${apex}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
  return response;
}

async function readJson(response, label) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
  return body;
}

const wwwResponse = await fetch(`${www}/`, {
  redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});
if (![301, 302, 307, 308].includes(wwwResponse.status)) {
  throw new Error(`www must redirect once; received ${wwwResponse.status}.`);
}
const wwwLocation = new URL(wwwResponse.headers.get("location") || "", `${www}/`);
if (wwwLocation.href !== `${apex}/`) {
  throw new Error(`www redirect target must be ${apex}/; received ${wwwLocation.href}.`);
}

const home = await request("/");
if (home.status !== 200) throw new Error(`Homepage returned ${home.status}.`);
const homeText = await home.text();
if (!homeText.includes("Better Real Estate Decisions.")) {
  throw new Error("Homepage does not contain the canonical headline.");
}
if (!/noindex/i.test(homeText) || !/nofollow/i.test(homeText)) {
  throw new Error("Prelaunch homepage must contain noindex,nofollow controls.");
}

const unknownPage = await request("/__release-smoke-not-found__/");
if (unknownPage.status !== 404) {
  throw new Error(`Unknown public route must return 404; received ${unknownPage.status}.`);
}

const robots = await request("/robots.txt");
if (robots.status !== 200) throw new Error(`robots.txt returned ${robots.status}.`);
const robotsText = await robots.text();
if (!/disallow:\s*\//i.test(robotsText)) {
  throw new Error("Prelaunch robots.txt must disallow crawling.");
}

const healthResponse = await request("/api/health");
if (healthResponse.status !== 200) {
  throw new Error(`/api/health returned ${healthResponse.status}.`);
}
const health = await readJson(healthResponse, "/api/health");
if (
  health?.ok !== true ||
  health?.data?.service !== "homeinstgeorgeutah-api" ||
  health?.data?.status !== "ok"
) {
  throw new Error("/api/health is not serving the expected Worker contract.");
}

const statusResponse = await request("/api/mls-status");
if (statusResponse.status !== 200) {
  throw new Error(`/api/mls-status returned ${statusResponse.status}.`);
}
const status = await readJson(statusResponse, "/api/mls-status");
const expectedScopes = [
  "washington-idx",
  "washington-vow",
  "iron-idx",
  "iron-vow",
];
const scopes = Array.isArray(status?.data?.scopes) ? status.data.scopes : [];
if (scopes.length !== expectedScopes.length) {
  throw new Error("MLS status did not return all four independent scopes.");
}
for (const key of expectedScopes) {
  const scope = scopes.find((candidate) => candidate?.key === key);
  if (!scope || scope.active !== false) {
    throw new Error(`${key} must remain inactive during the foundation release.`);
  }
}

for (const county of ["washington", "iron"]) {
  const response = await request(`/api/search?county=${county}`);
  if (response.status !== 200) {
    throw new Error(`${county} search returned ${response.status}.`);
  }
  const payload = await readJson(response, `${county} search`);
  if (payload?.data?.mode !== "disabled" || payload?.data?.listings?.length !== 0) {
    throw new Error(`${county} search must remain in the honest disabled state.`);
  }
}

const api404 = await request("/api/__release-smoke-not-found__");
if (api404.status !== 404) {
  throw new Error(`Unknown API route must return 404; received ${api404.status}.`);
}
const api404Body = await readJson(api404, "unknown API route");
if (api404Body?.ok !== false) {
  throw new Error("Unknown API route did not return the API error contract.");
}

const approvedPreflight = await request("/api/v1/leads/intake", {
  method: "OPTIONS",
  headers: { origin: apex },
});
if (
  approvedPreflight.status !== 204 ||
  approvedPreflight.headers.get("access-control-allow-origin") !== apex
) {
  throw new Error("Approved lead-origin preflight did not pass.");
}

const rejectedPreflight = await request("/api/v1/leads/intake", {
  method: "OPTIONS",
  headers: { origin: "https://unapproved.example" },
});
if (rejectedPreflight.status !== 403) {
  throw new Error("Unapproved lead-origin preflight was not rejected.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      homepage: 200,
      genuine404: true,
      wwwSingleRedirect: true,
      prelaunchCrawlControls: true,
      apiWorkerRoute: true,
      mlsScopesInactive: expectedScopes,
      leadOriginPolicy: true,
    },
    null,
    2,
  ),
);
