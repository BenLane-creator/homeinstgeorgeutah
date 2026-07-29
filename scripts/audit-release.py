#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "apps" / "site"
SITE_SRC = SITE / "src"
DIST = SITE / "dist"

errors: list[str] = []


def require(path: Path) -> str:
    if not path.exists():
        errors.append(f"Missing required release file: {path.relative_to(ROOT)}")
        return ""
    if path.is_file() and path.suffix.lower() not in {".webp", ".png"}:
        return path.read_text(errors="ignore")
    return ""


required_source_files = [
    SITE_SRC / "pages" / "contact.astro",
    SITE_SRC / "pages" / "privacy.astro",
    SITE_SRC / "pages" / "terms.astro",
    SITE_SRC / "pages" / "accessibility.astro",
    SITE_SRC / "pages" / "404.astro",
    SITE_SRC / "pages" / "homes" / "search.astro",
    SITE_SRC / "pages" / "account" / "index.astro",
    SITE_SRC / "components" / "LeadFormIsland.tsx",
    SITE_SRC / "components" / "SearchResultsIsland.tsx",
    SITE_SRC / "components" / "ConsumerAccountIsland.tsx",
    SITE / "public" / "_headers",
    SITE / "public" / "_redirects",
    SITE / "public" / "brand" / "hero" / "sot-hero-image.webp",
    SITE / "public" / "brand" / "hero" / "sot-hero-image-mobile.webp",
    SITE / "public" / "fonts" / "geist-latin-variable.woff2",
    SITE / "public" / "fonts" / "inter-latin-variable.woff2",
    ROOT / "apps" / "api" / "src" / "security" / "request-security.ts",
    ROOT / "apps" / "api" / "src" / "services" / "listing-service.ts",
    ROOT / "apps" / "api" / "src" / "services" / "mls-scope-service.ts",
    ROOT / "apps" / "api" / "src" / "services" / "vow-auth-service.ts",
    ROOT / "apps" / "api" / "src" / "services" / "consumer-account-service.ts",
    ROOT / "packages" / "db" / "migrations" / "0002_contact_integrity.sql",
    ROOT / "packages" / "db" / "migrations" / "0003_mls_scopes.sql",
    ROOT / "packages" / "db" / "migrations" / "0006_vow_consumer_accounts.sql",
    ROOT / "THIRD_PARTY_FONT_LICENSES.md",
]

for required in required_source_files:
    require(required)

banned_public_phrases = [
    "custom copy goes here",
    "source layer",
    "normalized dto",
    "owned lead engine",
    "product shell",
    "configure spark",
    "developer-facing",
]

public_extensions = {".astro", ".tsx", ".mdx", ".md"}
for path in sorted(SITE_SRC.rglob("*")):
    if not path.is_file() or path.suffix not in public_extensions:
        continue
    text = path.read_text(errors="ignore").lower()
    for phrase in banned_public_phrases:
        if phrase in text:
            errors.append(
                f"Developer or placeholder copy remains in {path.relative_to(ROOT)}: {phrase}"
            )

hero = require(SITE_SRC / "components" / "Hero.astro")
hero_copy = " ".join(re.sub(r"<[^>]+>", " ", hero).split())
if "Better Real Estate Decisions." not in hero_copy:
    errors.append('Homepage headline is not "Better Real Estate Decisions."')
if "data:image" in hero:
    errors.append("Hero image is still embedded as a data URI instead of a responsive asset.")
for marker in ["sot-hero-image-mobile.webp", 'width="1536"', 'height="1024"']:
    if marker not in hero:
        errors.append(f"Hero is missing responsive media control: {marker}")

global_css = require(SITE_SRC / "styles" / "global.css")
for font_asset in ["geist-latin-variable.woff2", "inter-latin-variable.woff2"]:
    if font_asset not in global_css:
        errors.append(f"Declared brand font is not loaded: {font_asset}")
if "data:font" in global_css:
    errors.append("Fonts are still embedded as data URIs instead of cacheable assets.")

featured = require(SITE_SRC / "components" / "NeighborhoodCards.astro")
featured_names = re.findall(r'name:\s*"([^"]+)"', featured)
expected_featured = ["Winchester Hills", "Dammeron Valley", "Sunbrook", "Ivins"]
if featured_names != expected_featured:
    errors.append(
        f"Featured areas must be exactly {expected_featured}; found {featured_names}."
    )

astro_config = require(SITE / "astro.config.mjs")
content_config = require(SITE_SRC / "content.config.ts")
if "mdx()" not in astro_config:
    errors.append("Astro MDX integration is not enabled.")
if 'glob({' not in content_config or 'pubDate: data.pubDate ?? data.date' not in content_config:
    errors.append("Content collections are missing the supported loader or legacy date normalization.")
for relative in ["pages/neighborhoods/[slug].astro", "pages/blog/[slug].astro"]:
    page = require(SITE_SRC / relative)
    if "render(entry)" not in page or "<Content />" not in page:
        errors.append(f"{relative} is not rendering through Astro content collections.")

search_page = require(SITE_SRC / "pages" / "homes" / "search.astro")
search_island = require(SITE_SRC / "components" / "SearchResultsIsland.tsx")
if 'name="county"' not in search_page:
    errors.append("Search page is missing the independent Washington/Iron MLS scope selector.")
if "/api/search" not in search_island:
    errors.append("Search results do not call the Worker /api/search endpoint.")
if "/api/v1/search/execute" in search_island or '"stub"' in search_island:
    errors.append("Legacy or public stub search behavior remains in SearchResultsIsland.")
if "error.message" in search_island:
    errors.append("Search UI may expose raw technical errors to visitors.")

lead_island = require(SITE_SRC / "components" / "LeadFormIsland.tsx")
if "/api/v1/leads/intake" not in lead_island:
    errors.append("Lead form is not connected to /api/v1/leads/intake.")

account_page = require(SITE_SRC / "pages" / "account" / "index.astro")
account_island = require(SITE_SRC / "components" / "ConsumerAccountIsland.tsx")
if "ConsumerAccountIsland" not in account_page or 'pathname="/account/"' not in account_page:
    errors.append("Consumer account route is not wired to the account island.")
for control in [
    "/api/v1/session",
    "/api/mls-status",
    "/api/v1/saved-homes",
    "/api/v1/saved-searches",
    "/api/v1/auth/flexmls/start",
    "scope.active",
]:
    if control not in account_island:
        errors.append(f"Consumer account UI is missing fail-closed control: {control}")

listing_service = require(ROOT / "apps" / "api" / "src" / "services" / "listing-service.ts")
mls_scope_service = require(ROOT / "apps" / "api" / "src" / "services" / "mls-scope-service.ts")
for gate in [
    "WASHINGTON_IDX_APPROVAL_STATUS",
    "WASHINGTON_VOW_APPROVAL_STATUS",
    "IRON_IDX_APPROVAL_STATUS",
    "IRON_VOW_APPROVAL_STATUS",
    "APPROVED_POLICY_VERSIONS",
    "getActiveIdxSource",
    "getActiveVowSource",
]:
    if gate not in mls_scope_service and gate not in listing_service:
        errors.append(f"MLS integration is missing county/role activation gate: {gate}")
for routing_control in [
    'counties: ["Washington", "Iron"]',
    "county: MlsCounty",
    "getActiveIdxSource(env, params.county)",
    "isMlsCounty(requestedCounty)",
]:
    if routing_control not in listing_service:
        errors.append(
            f"Listing adapter is missing explicit Washington/Iron county routing: {routing_control}"
        )

wrangler = require(ROOT / "apps" / "api" / "wrangler.toml")
for disabled_gate in [
    'WASHINGTON_IDX_ENABLED = "false"',
    'WASHINGTON_VOW_ENABLED = "false"',
    'IRON_IDX_ENABLED = "false"',
    'IRON_VOW_ENABLED = "false"',
]:
    if disabled_gate not in wrangler:
        errors.append(f"Production MLS scope must default disabled: {disabled_gate}")
if 'VOW_REDIRECT_URI = "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback"' not in wrangler:
    errors.append("Registered production VOW callback is missing from Worker configuration.")
for vow_configuration in [
    'WASHINGTON_VOW_CONTACT_URL = ""',
    'IRON_VOW_CONTACT_URL = ""',
    "VOW_TOKEN_ENCRYPTION_KEY",
]:
    if vow_configuration not in wrangler:
        errors.append(f"VOW production configuration is missing: {vow_configuration}")
if 'name = "LEAD_RATE_LIMITER"' not in wrangler:
    errors.append("Production lead rate-limit binding is missing.")

api_index = require(ROOT / "apps" / "api" / "src" / "index.ts")
for control in ["requireApprovedWriteOrigin", "enforceLeadRateLimit", "readJsonBody", "verifyTurnstile"]:
    if control not in api_index:
        errors.append(f"Lead route is missing request protection: {control}")
for route in [
    "/api/v1/auth/flexmls/start",
    "/api/v1/auth/flexmls/callback",
    "/api/v1/session",
    "/api/v1/session/logout",
    "/api/v1/saved-homes",
    "/api/v1/saved-searches",
]:
    if route not in api_index:
        errors.append(f"Consumer account API route is missing: {route}")
if "VOW_AUTHORIZATION_PENDING" not in api_index:
    errors.append("VOW authorization does not fail closed while pending.")

vow_auth_service = require(ROOT / "apps" / "api" / "src" / "services" / "vow-auth-service.ts")
for control in [
    "AES-GCM",
    "__Host-hisgu_session",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "claimAttempt",
    "tokenEncryptionKey",
]:
    if control not in vow_auth_service:
        errors.append(f"VOW authorization service is missing security control: {control}")

lead_service = require(ROOT / "apps" / "api" / "src" / "services" / "lead-service.ts")
if ".batch(" not in lead_service or "coalesce(excluded.phone, contacts.phone)" not in lead_service:
    errors.append("Lead storage is missing atomic batch writes or safe phone preservation.")

base_layout = require(SITE_SRC / "layouts" / "BaseLayout.astro")
for control in ["PUBLIC_PRELAUNCH", 'name="robots"', "shouldNoindex"]:
    if control not in base_layout:
        errors.append("BaseLayout is missing environment-controlled prelaunch noindex metadata.")
        break

headers = require(SITE / "public" / "_headers")
if "Content-Security-Policy:" not in headers:
    errors.append("Static responses are missing a Content Security Policy.")

robots = SITE / "public" / "robots.txt"
if not robots.exists() or "Disallow: /" not in robots.read_text(errors="ignore"):
    errors.append("robots.txt is not blocking crawlers during prelaunch.")

workflow = require(ROOT / ".github" / "workflows" / "release-qa.yml")
for gate in [
    "bun test",
    "audit-fair-housing.py",
    "playwright install --with-deps chromium",
    "bun run test:e2e",
    "wrangler deploy --dry-run",
    "bun audit --audit-level=high",
]:
    if gate not in workflow:
        errors.append(f"Release workflow is missing required gate: {gate}")

required_dist_routes = [
    "index.html",
    "404.html",
    "contact/index.html",
    "privacy/index.html",
    "terms/index.html",
    "accessibility/index.html",
    "homes/search/index.html",
    "account/index.html",
]

if DIST.exists():
    for route in required_dist_routes:
        if not (DIST / route).exists():
            errors.append(f"Built release route is missing: {route}")

    canonical_pattern = re.compile(
        r'<link\s+rel="canonical"\s+href="https://homeinstgeorgeutah\.com[^"]*"',
        re.IGNORECASE,
    )
    noindex_pattern = re.compile(
        r'<meta\s+name="robots"\s+content="[^"]*noindex',
        re.IGNORECASE,
    )
    for path in sorted(DIST.rglob("*.html")):
        html = path.read_text(errors="ignore")
        is_redirect = 'http-equiv="refresh"' in html.lower()
        if not is_redirect and not canonical_pattern.search(html):
            errors.append(f"Canonical domain missing from {path.relative_to(DIST)}")
        if not noindex_pattern.search(html):
            errors.append(f"Prelaunch noindex missing from {path.relative_to(DIST)}")

    sitemap = DIST / "sitemap.xml"
    if sitemap.exists() and "<loc>https://homeinstgeorgeutah.com/homes/</loc>" in sitemap.read_text(errors="ignore"):
        errors.append("Sitemap still contains the redirect-only /homes/ URL.")
else:
    errors.append("Site build output is missing; run the site build before this audit.")

if errors:
    print("Release audit failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Release audit passed: release contract, security gates, content, routes, and prelaunch controls are present.")
