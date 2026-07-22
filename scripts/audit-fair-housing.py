#!/usr/bin/env python3
"""Flag subjective neighborhood suitability language before release."""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "apps" / "site" / "src" / "content" / "neighborhoods",
    ROOT / "apps" / "site" / "src" / "components" / "NeighborhoodCards.astro",
]

PATTERNS = {
    "family-oriented or family-friendly": re.compile(
        r"\bfamily[ -](?:oriented|friendly)\b", re.IGNORECASE
    ),
    "safety characterization": re.compile(
        r"\b(?:safe|safer|safest)\b", re.IGNORECASE
    ),
    "quiet characterization": re.compile(r"\bquiet(?:er|est)?\b", re.IGNORECASE),
    "resident suitability": re.compile(
        r"\b(?:ideal|perfect|great|best) for\b|"
        r"\bappeal(?:s|ing)? to\b|"
        r"\b(?:buyer|resident) profile\b|"
        r"\b(?:good|strong|natural) fit\b|"
        r"\bwho (?:want|value|prefer)\b|"
        r"\bwhen (?:they|buyers|residents) (?:want|value|prefer)\b",
        re.IGNORECASE,
    ),
}


def source_files() -> list[Path]:
    files: list[Path] = []
    for target in TARGETS:
        if target.is_dir():
            files.extend(sorted(target.glob("*.mdx")))
        elif target.is_file():
            files.append(target)
    return files


errors: list[str] = []
files = source_files()

if not files:
    errors.append("No neighborhood content was found to audit.")

for path in files:
    for line_number, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
        for label, pattern in PATTERNS.items():
            match = pattern.search(line)
            if match:
                errors.append(
                    f"{path.relative_to(ROOT)}:{line_number}: {label}: {match.group(0)!r}"
                )

if errors:
    print("Fair Housing language audit failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print(f"Fair Housing language audit passed for {len(files)} public source files.")
