#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK_PATHS = [ROOT / "docs", ROOT / "packages", ROOT / "apps"]
ALLOWED_HISTORICAL = {
    ROOT / "docs" / "wp-setup.md",
    ROOT / "docs" / "flexmls-integration.md.superseded-wp-hybrid",
}
FORBIDDEN_ACTIVE_PHRASES = [
    "Current Flexmls route",
    "Route users to the authorized Flexmls runtime",
    "WordPress: Flexmls IDX runtime",
    "Use Flexmls/WordPress runtime",
    "PUBLIC_WORDPRESS_ORIGIN",
    "PUBLIC_IDX_BASE_URL=https://wp.",
]

failures: list[str] = []

for base in CHECK_PATHS:
    for path in base.rglob("*"):
        if not path.is_file() or path.suffix not in {".md", ".ts", ".tsx", ".astro", ".toml", ".json"}:
            continue
        if path in ALLOWED_HISTORICAL or ".superseded" in path.name:
            continue
        text = path.read_text(errors="ignore")
        for phrase in FORBIDDEN_ACTIVE_PHRASES:
            if phrase in text:
                failures.append(f"{path.relative_to(ROOT)} contains active drift phrase: {phrase}")

if failures:
    print("Architecture drift detected:")
    for failure in failures:
        print(f"- {failure}")
    raise SystemExit(1)

print("Architecture drift audit passed.")
