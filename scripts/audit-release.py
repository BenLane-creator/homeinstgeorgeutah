#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE_SRC = ROOT / "apps" / "site" / "src"
DIST = ROOT / "apps" / "site" / "dist"

errors: list[str] = []

required_source_files = [
    SITE_SRC / "pages" / "contact.astro",
    SITE_SRC / "pages" / "privacy.astro",
    SITE_SRC / "pages" / "terms.astro",
    SITE_SRC / "pages" / "accessibility.astro",
    SITE_SRC / "pages" / "homes" / "search.astro",
    SITE_SRC / "components" / "LeadFormIsland.tsx",
    SITE_SRC / "components" / "SearchResultsIsland.tsx",
    ROOT / "apps" / "site" / "public" / "brand" / "hero" / "sot-hero-image-final.png",
]

for path in required_source_files:
    if not path.exists():
        errors.append(f"Missing required release file: {path.relative_to(ROOT)}")

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

search_island = SITE_SRC / "components" / "SearchResultsIsland.tsx"
if search_island.exists():
    text = search_island.read_text(errors="ignore")
    if '"/api/search' not in text:
        errors.append("Search results do not call the Worker /api/search endpoint.")
    if "/api/v1/search/execute" in text:
        errors.append("Legacy search endpoint remains in SearchResultsIsland.")

lead_island = SITE_SRC / "components" / "LeadFormIsland.tsx"
if lead_island.exists() and "/api/v1/leads/intake" not in lead_island.read_text(errors="ignore"):
    errors.append("Lead form is not connected to /api/v1/leads/intake.")

base_layout = SITE_SRC / "layouts" / "BaseLayout.astro"
if base_layout.exists():
    layout_text = base_layout.read_text(errors="ignore")
    if "PUBLIC_PRELAUNCH" not in layout_text or 'content={robotsContent}' not in layout_text:
        errors.append("BaseLayout is missing environment-controlled prelaunch noindex metadata.")
else:
    errors.append("BaseLayout.astro is missing.")

robots = ROOT / "apps" / "site" / "public" / "robots.txt"
if not robots.exists() or "Disallow: /" not in robots.read_text(errors="ignore"):
    errors.append("robots.txt is not blocking crawlers during prelaunch.")

required_dist_routes = [
    "index.html",
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

    html_files = sorted(DIST.rglob("*.html"))
    canonical_pattern = re.compile(
        r'<link\s+rel="canonical"\s+href="https://homeinstgeorgeutah\.com[^"]*"',
        re.IGNORECASE,
    )
    noindex_pattern = re.compile(
        r'<meta\s+name="robots"\s+content="[^"]*noindex',
        re.IGNORECASE,
    )

    for path in html_files:
        html = path.read_text(errors="ignore")
        if not canonical_pattern.search(html):
            errors.append(f"Canonical domain missing from {path.relative_to(DIST)}")
        if not noindex_pattern.search(html):
            errors.append(f"Prelaunch noindex missing from {path.relative_to(DIST)}")
else:
    errors.append("Site build output is missing; run the site build before this audit.")

if errors:
    print("Release audit failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Release audit passed: routes, copy, forms, endpoints, metadata, and prelaunch controls are present.")
