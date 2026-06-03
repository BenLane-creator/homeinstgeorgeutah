from pathlib import Path
import sys
from urllib.parse import urlparse

ROOT = Path.cwd()
SRC_NEIGHBORHOODS = ROOT / "apps/site/src/content/neighborhoods"
SRC_PAGES_NEIGHBORHOODS = ROOT / "apps/site/src/pages/neighborhoods"
DIST = ROOT / "apps/site/dist"
DIST_NEIGHBORHOODS = DIST / "neighborhoods"

IGNORE_PREFIXES = (
    "http://",
    "https://",
    "mailto:",
    "tel:",
    "#",
    "javascript:",
)

RUNTIME_ALLOWED_PREFIXES = (
    "/api/",
    "/idx/",
    "/homes/search/",
    "/homes/search",
)

def read(path):
    return path.read_text(errors="ignore")

def slug_from_frontmatter(path):
    text = read(path)

    for line in text.splitlines():
        line = line.strip()

        if not line.startswith("slug:"):
            continue

        value = line.split(":", 1)[1].strip()
        value = value.strip('"').strip("'")
        return value

    return path.stem

def extract_hrefs(text):
    hrefs = []

    marker = 'href="'
    start = 0
    while True:
        idx = text.find(marker, start)
        if idx == -1:
            break
        begin = idx + len(marker)
        end = text.find('"', begin)
        if end == -1:
            break
        hrefs.append(text[begin:end])
        start = end + 1

    marker = "href='"
    start = 0
    while True:
        idx = text.find(marker, start)
        if idx == -1:
            break
        begin = idx + len(marker)
        end = text.find("'", begin)
        if end == -1:
            break
        hrefs.append(text[begin:end])
        start = end + 1

    return hrefs

def should_check(href):
    if not href:
        return False
    if href.startswith(IGNORE_PREFIXES):
        return False
    if href.startswith("//"):
        return False
    if href.startswith("/_astro/"):
        return False
    return href.startswith("/")

def route_to_dist_file(href):
    route = urlparse(href).path

    if route == "/":
        return DIST / "index.html"

    if any(route.startswith(prefix) for prefix in RUNTIME_ALLOWED_PREFIXES):
        return None

    route = route.strip("/")

    if not route:
        return DIST / "index.html"

    return DIST / route / "index.html"

errors = []
warnings = []

content_slugs = []
if SRC_NEIGHBORHOODS.exists():
    for path in sorted(SRC_NEIGHBORHOODS.glob("*.mdx")):
        content_slugs.append(slug_from_frontmatter(path))
else:
    errors.append(f"Missing content directory: {SRC_NEIGHBORHOODS}")

static_slugs = []
if SRC_PAGES_NEIGHBORHOODS.exists():
    for path in sorted(SRC_PAGES_NEIGHBORHOODS.glob("*.astro")):
        name = path.name

        if name in ("index.astro", "[slug].astro"):
            continue

        if ".before" in name or name.endswith(".disabled") or name.endswith(".bak"):
            continue

        static_slugs.append(path.stem)
else:
    errors.append(f"Missing neighborhood pages directory: {SRC_PAGES_NEIGHBORHOODS}")

all_slugs = sorted(set(content_slugs + static_slugs))

for slug in all_slugs:
    expected = DIST_NEIGHBORHOODS / slug / "index.html"

    if not expected.exists():
        errors.append(f"Missing generated neighborhood page: /neighborhoods/{slug}/ -> {expected}")

index_file = DIST_NEIGHBORHOODS / "index.html"

if index_file.exists():
    index_html = read(index_file)

    for slug in all_slugs:
        link_a = f'href="/neighborhoods/{slug}/"'
        link_b = f'href="/neighborhoods/{slug}"'

        if link_a not in index_html and link_b not in index_html:
            warnings.append(f"/neighborhoods/ index may not link to /neighborhoods/{slug}/")
else:
    errors.append("Missing generated /neighborhoods/index.html")

if DIST.exists():
    for html_file in sorted(DIST.rglob("*.html")):
        html = read(html_file)

        for href in extract_hrefs(html):
            if not should_check(href):
                continue

            target = route_to_dist_file(href)

            if target is None:
                continue

            if not target.exists():
                errors.append(
                    f"Broken generated link in {html_file.relative_to(DIST)}: {href} -> missing {target.relative_to(DIST)}"
                )
else:
    errors.append(f"Missing dist directory: {DIST}")

for folder in [ROOT / "apps/site/src", ROOT / "packages/config"]:
    if not folder.exists():
        continue

    for file in sorted(folder.rglob("*")):
        if not file.is_file():
            continue

        if file.suffix not in {".astro", ".tsx", ".ts", ".mdx", ".md"}:
            continue

        if ".before" in file.name or file.name.endswith(".bak"):
            continue

        for href in extract_hrefs(read(file)):
            if not should_check(href):
                continue

            route = urlparse(href).path

            if route == "/":
                continue

            if any(route.startswith(prefix) for prefix in RUNTIME_ALLOWED_PREFIXES):
                continue

            if not route.endswith("/"):
                warnings.append(f"Internal source link may need trailing slash: {file.relative_to(ROOT)}: {href}")

print("=== NEIGHBORHOOD LINK AUDIT ===")
print(f"Content neighborhood MDX files: {len(content_slugs)}")
print(f"Static neighborhood Astro pages: {len(static_slugs)}")
print(f"Total expected neighborhood routes: {len(all_slugs)}")

print("")
print("=== ERRORS ===")

if errors:
    for error in errors:
        print(f"ERROR: {error}")
else:
    print("No blocking errors found.")

print("")
print("=== WARNINGS ===")

if warnings:
    for warning in warnings:
        print(f"WARNING: {warning}")
else:
    print("No warnings found.")

print("")
print("=== RESULT ===")

if errors:
    print("FAIL: Fix errors before redeploy.")
    sys.exit(1)

print("PASS: No broken generated neighborhood/internal links found.")
