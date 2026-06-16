# Lead Engine Remote Readiness

## Purpose

Prepare for controlled production D1/API verification without accidentally applying migrations, deploying code, changing DNS, or deleting production data.

## Current rule

Default to local/read-only commands.

Remote commands must be explicit.

Do not run remote writes, cleanup, migrations, deploys, or DNS changes unless explicitly authorized.

## Read-only checks

From repo root:

```bash
git status
bun run check
bun --filter @home/api test
bun --filter @home/api typecheck
bun run build:site
bun run audit:architecture
python3 scripts/audit-neighborhood-links.py
```

Check local D1 schema:

```bash
./scripts/verify-d1-lead-schema.sh --local
```

Check remote D1 schema read-only:

```bash
./scripts/verify-d1-lead-schema.sh --remote
```

Check pending migrations without applying:

```bash
bunx wrangler d1 migrations list homeinstgeorgeutah \
  --remote \
  --config apps/api/wrangler.toml
```

## Controlled production test lead sequence

Only after explicit authorization:

1. Confirm current branch is `main`.
2. Confirm working tree is clean.
3. Confirm remote D1 schema includes `contacts`, `attribution_sessions`, `property_context`, `lead_events`, and `routing_decisions`.
4. Confirm Worker deployment target and route.
5. Submit one controlled test lead.
6. Query D1 for that test lead.
7. Delete the test lead only if cleanup is authorized.

## Smoke lead cleanup

Local cleanup:

```bash
./scripts/cleanup-smoke-leads.sh --local
```

Remote cleanup is blocked unless explicitly confirmed:

```bash
./scripts/cleanup-smoke-leads.sh --remote --confirm-remote-cleanup
```

Do not run remote cleanup unless explicitly authorized.

## Not included

This readiness step does not apply D1 migrations, deploy the Worker, deploy the site, change DNS, add MLS credentials, enable Turnstile enforcement, or create CRM/booking handoffs.
