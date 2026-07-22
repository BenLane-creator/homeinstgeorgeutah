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
    SITE_SRC / "components" / "LeadFormIsland.tsx",
    SITE_SRC / "components" / "SearchResultsIsland.tsx",
    SITE / "public" / "_headers",
    SITE / "public" / "_redirects",
    SITE / "public" / "brand" / "hero" / "sot-hero-image.webp",
    SITE / "public" / "brand" / "hero" / "sot-hero-image-mobile.webp",
    SITE / "public" / "fonts" / "geist-latin-variable.woff2",
    SITE / "public" / "fonts" / "inter-latin-variable.woff2",
    ROOT / "apps" / "api" / "src" / "security" / "request-security.ts",
    ROOT / "apps" / "api" / "src" / "services" / "listing-service.ts",
    ROOT / "packages" / "db" / "migrations" / "0002_contact_integrity.sql",
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

search_island = require(SITE_SRC / "components" / "SearchResultsIsland.tsx")
if "/api/search" not in search_island:
    errors.append("Search results do not call the Worker /api/search endpoint.")
if "/api/v1/search/execute" in search_island or '"stub"' in search_island:
    errors.append("Legacy or public stub search behavior remains in SearchResultsIsland.")
if "error.message" in search_island:
    errors.append("Search UI may expose raw technical errors to visitors.")

lead_island = require(SITE_SRC / "components" / "LeadFormIsland.tsx")
if "/api/v1/leads/intake" not in lead_island:
    errors.append("Lead form is not connected to /api/v1/leads/intake.")

listing_service = require(ROOT / "apps" / "api" / "src" / "services" / "listing-service.ts")
for gate in [
    "MLS_ACTIVATION_ENABLED",
    "MLS_POLICY_VERSION",
    "LISTING_PROVIDER",
    'county: "Washington"',
    'ironCountyEnabled: false',
]:
    if gate not in listing_service:
        errors.append(f"Listing adapter is missing activation or geography gate: {gate}")

wrangler = require(ROOT / "apps" / "api" / "wrangler.toml")
if 'MLS_ACTIVATION_ENABLED = "false"' not in wrangler:
    errors.append("Production MLS activation must default to false.")
if 'name = "LEAD_RATE_LIMITER"' not in wrangler:
    errors.append("Production lead rate-limit binding is missing.")

api_index = require(ROOT / "apps" / "api" / "src" / "index.ts")
for control in ["enforceWriteOrigin", "enforceLeadRateLimit", "readJsonBody", "verifyTurnstile"]:
    if control not in api_index:
        errors.append(f"Lead route is missing request protection: {control}")

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
