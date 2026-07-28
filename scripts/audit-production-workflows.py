#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
release_path = ROOT / ".github/workflows/production-release.yml"
rollback_path = ROOT / ".github/workflows/production-rollback.yml"
preflight_path = ROOT / ".github/workflows/production-preflight.yml"
smoke_path = ROOT / "scripts/verify-production-smoke.mjs"
export_path = ROOT / "scripts/verify-d1-export.mjs"

for path in [release_path, rollback_path, preflight_path, smoke_path, export_path]:
    if not path.is_file():
        raise SystemExit(f"Missing required production control file: {path.relative_to(ROOT)}")

release = release_path.read_text()
rollback = rollback_path.read_text()
preflight = preflight_path.read_text()
smoke = smoke_path.read_text()
export_check = export_path.read_text()

for name, workflow in [
    ("release", release),
    ("rollback", rollback),
    ("preflight", preflight),
]:
    if "workflow_dispatch:" not in workflow:
        raise SystemExit(f"{name} workflow must support explicit manual dispatch.")
    if "actions/checkout@v6" not in workflow:
        raise SystemExit(f"{name} workflow must use the Node 24 checkout action.")
    if "ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION" in workflow:
        raise SystemExit(f"{name} workflow must not opt back into Node 20.")

if "\n  push:" in release or "\n  pull_request:" in release:
    raise SystemExit("Production release must never run automatically.")
if "\n  push:" in rollback or "\n  pull_request:" in rollback:
    raise SystemExit("Production rollback must never run automatically.")

release_requirements = [
    "DEPLOY FOUNDATION",
    "BACKUP_ENCRYPTION_PASSPHRASE",
    "wrangler d1 export",
    "verify-d1-export.mjs",
    "openssl enc -aes-256-cbc -pbkdf2",
    "wrangler d1 migrations apply",
    "wrangler deploy",
    "--tag \"$RELEASE_SHA\"",
    "wrangler pages deploy",
    "--commit-hash \"$RELEASE_SHA\"",
    "verify-production-deployment.mjs",
    "verify-production-smoke.mjs",
    "actions/upload-artifact@v6",
]
for requirement in release_requirements:
    if requirement not in release:
        raise SystemExit(f"Production release is missing required control: {requirement}")

ordered_markers = [
    "wrangler d1 export",
    "wrangler d1 migrations apply",
    "bunx wrangler deploy",
    "bunx wrangler pages deploy",
    "verify-production-smoke.mjs",
]
positions = [release.index(marker) for marker in ordered_markers]
if positions != sorted(positions):
    raise SystemExit("Production release order must be backup, migrate, deploy, then smoke test.")

if "ROLLBACK APPLICATION WITHOUT D1 RESTORE" not in rollback:
    raise SystemExit("Rollback must require the explicit no-D1-restore confirmation.")
if "wrangler rollback" not in rollback or "wrangler pages deploy" not in rollback:
    raise SystemExit("Rollback must restore both the Worker version and prior Pages SHA.")
if "time-travel restore" in rollback:
    raise SystemExit("Application rollback must never restore D1 automatically.")
if "actions/upload-artifact@v6" not in rollback:
    raise SystemExit("Rollback must preserve an evidence artifact using the Node 24 action.")

for phrase in [
    "Better Real Estate Decisions.",
    "washington-idx",
    "washington-vow",
    "iron-idx",
    "iron-vow",
    "noindex",
    "nofollow",
    "Unapproved lead-origin preflight",
]:
    if phrase not in smoke:
        raise SystemExit(f"Production smoke test is missing: {phrase}")

for phrase in ["pragma integrity_check", "contacts", "lead_events", "d1_migrations"]:
    if phrase not in export_check:
        raise SystemExit(f"D1 restore drill is missing: {phrase}")

print("Production release, rollback, preflight, smoke, and D1 restore boundaries verified.")
