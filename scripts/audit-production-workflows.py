#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
release_path = ROOT / ".github/workflows/production-release.yml"
rollback_path = ROOT / ".github/workflows/production-rollback.yml"
preflight_path = ROOT / ".github/workflows/production-preflight.yml"
worker_config_path = ROOT / "apps/api/wrangler.toml"
bootstrap_config_path = ROOT / "apps/api/wrangler.bootstrap.toml"
bootstrap_source_path = ROOT / "apps/api/src/bootstrap-unavailable.ts"
worker_state_helper_path = ROOT / "scripts/verify-worker-bootstrap-state.mjs"
smoke_path = ROOT / "scripts/verify-production-smoke.mjs"
export_path = ROOT / "scripts/verify-d1-export.mjs"
preflight_helper_path = ROOT / "scripts/verify-production-preflight.mjs"

audit_paths = [
    release_path,
    rollback_path,
    preflight_path,
    worker_config_path,
    bootstrap_config_path,
    bootstrap_source_path,
    worker_state_helper_path,
    smoke_path,
    export_path,
    preflight_helper_path,
]
for path in audit_paths:
    if not path.is_file():
        raise SystemExit(f"Missing required production control file: {path.relative_to(ROOT)}")

release = release_path.read_text()
rollback = rollback_path.read_text()
preflight = preflight_path.read_text()
worker_config = worker_config_path.read_text()
bootstrap_config = bootstrap_config_path.read_text()
bootstrap_source = bootstrap_source_path.read_text()
worker_state_helper = worker_state_helper_path.read_text()
smoke = smoke_path.read_text()
export_check = export_path.read_text()
preflight_helper = preflight_helper_path.read_text()

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
    "INTERNAL_JOB_TOKEN",
    "TURNSTILE_SECRET_KEY",
    "wrangler d1 export",
    "verify-d1-export.mjs",
    "openssl enc -aes-256-cbc -pbkdf2",
    "wrangler d1 migrations apply",
    "verify-worker-bootstrap-state.mjs",
    "/workers/scripts",
    "BOOTSTRAP_WORKER_CONFIG",
    "bootstrap-unavailable-$RELEASE_SHA",
    "wrangler deploy",
    "--strict",
    "--secrets-file",
    "--tag \"$RELEASE_SHA\"",
    "wrangler pages deploy",
    "--commit-hash \"$RELEASE_SHA\"",
    "worker-secrets-after.json",
    "verify-production-deployment.mjs",
    "verify-production-smoke.mjs",
    "actions/upload-artifact@v6",
]
for requirement in release_requirements:
    if requirement not in release:
        raise SystemExit(f"Production release is missing required control: {requirement}")

ordered_step_boundaries = [
    "- name: Export, locally restore, and encrypt production D1",
    "- name: Apply and verify all production D1 migrations",
    "- name: Create fail-closed rollback Worker for first deployment",
    "- name: Deploy Worker and Pages from the same release SHA",
    "- name: Verify deployed Worker and Pages metadata",
    "- name: Run production route and fail-closed smoke tests",
]
positions = [release.index(marker) for marker in ordered_step_boundaries]
if positions != sorted(positions):
    raise SystemExit(
        "Production release order must be backup, migrate, establish rollback, deploy, verify, then smoke test."
    )

for required_secret in ["INTERNAL_JOB_TOKEN", "TURNSTILE_SECRET_KEY"]:
    if required_secret not in worker_config:
        raise SystemExit(f"Worker config does not declare required secret: {required_secret}")
if "[secrets]" not in worker_config or "required =" not in worker_config:
    raise SystemExit("Worker config must declare its required production secrets.")

for phrase in [
    'name = "homeinstgeorgeutah-api"',
    'main = "src/bootstrap-unavailable.ts"',
    "homeinstgeorgeutah.com/api/*",
]:
    if phrase not in bootstrap_config:
        raise SystemExit(f"Bootstrap Worker config is missing: {phrase}")
for phrase in ["FOUNDATION_ROLLBACK", "status: 503", '"cache-control": "no-store"']:
    if phrase not in bootstrap_source:
        raise SystemExit(f"Bootstrap Worker is missing fail-closed control: {phrase}")
for phrase in ["payload?.success !== true", "Array.isArray(payload.result)", "exists:"]:
    if phrase not in worker_state_helper:
        raise SystemExit(f"Worker bootstrap state verifier is missing: {phrase}")

if "ROLLBACK APPLICATION WITHOUT D1 RESTORE" not in rollback:
    raise SystemExit("Rollback must require the explicit no-D1-restore confirmation.")
if "wrangler rollback" not in rollback or "wrangler pages deploy" not in rollback:
    raise SystemExit("Rollback must restore both the Worker version and prior Pages SHA.")
if "time-travel restore" in rollback:
    raise SystemExit("Application rollback must never restore D1 automatically.")
if "actions/upload-artifact@v6" not in rollback:
    raise SystemExit("Rollback must preserve an evidence artifact using the Node 24 action.")

preflight_requirements = [
    "verify-production-preflight.mjs",
    "wrangler d1 list --json",
    "wrangler d1 info",
    "wrangler d1 execute",
    "d1_migrations",
    "contacts_email_normalized_unique_idx",
    "duplicate_email_group_count",
    "wrangler deployments status",
    "wrangler secret list",
    "/api/health",
    "/api/mls-status",
    "/api/v1/session",
]
for requirement in preflight_requirements:
    if requirement not in preflight:
        raise SystemExit(f"Production preflight is missing: {requirement}")

if "/api/v1/auth/flexmls/start" in preflight:
    raise SystemExit(
        "Read-only production preflight must not invoke the stateful VOW authorization start route."
    )

prohibited_command_patterns = {
    "wrangler deploy": r"\bwrangler\s+deploy(?:\s|\\)",
    "wrangler pages deploy": r"\bwrangler\s+pages\s+deploy(?:\s|\\)",
    "wrangler d1 migrations apply": r"\bwrangler\s+d1\s+migrations\s+apply(?:\s|\\)",
    "wrangler d1 export": r"\bwrangler\s+d1\s+export(?:\s|\\)",
    "wrangler rollback": r"\bwrangler\s+rollback(?:\s|\\)",
    "time-travel restore": r"\btime-travel\s+restore(?:\s|\\)",
    "secret put": r"\bsecret\s+put(?:\s|\\)",
    "secret delete": r"\bsecret\s+delete(?:\s|\\)",
}
for label, pattern in prohibited_command_patterns.items():
    if re.search(pattern, preflight):
        raise SystemExit(f"Read-only production preflight contains a mutation command: {label}")

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

for phrase in [
    "CLOUDFLARE_ACCOUNT_ID",
    "packages/db/migrations",
    "applied_migrations",
    "unique_index_count",
    "duplicate_email_group_count",
    "INTERNAL_JOB_TOKEN",
    "TURNSTILE_SECRET_KEY",
    "VOW_TOKEN_ENCRYPTION_KEY",
    "washington-idx",
    "iron-vow",
    "anonymousAccountSession",
]:
    if phrase not in preflight_helper:
        raise SystemExit(f"Production preflight verifier is missing: {phrase}")

print("Production release, rollback, preflight, bootstrap, smoke, and D1 restore boundaries verified.")
