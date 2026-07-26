# HomeInStGeorgeUtah Modern Stack

This repository implements the custom HomeInStGeorgeUtah.com website, owned lead engine, and owned canonical listing cache.

## Production direction

```txt
homeinstgeorgeutah.com             -> Astro public site on Cloudflare Pages
homeinstgeorgeutah.com/api/*       -> Cloudflare Worker API
Cloudflare D1                      -> operational and listing-cache source of truth
MLS-approved API access            -> replaceable RESO-shaped source adapters
Washington County IDX + VOW        -> independent authorization/display scope
Iron County IDX + VOW              -> independent authorization/display scope
```

All four MLS subscriptions are currently pending. Pending status never enables live listing or VOW access.

## Architecture rule

The system is divided into four layers:

1. **Source Layer** — MLS-approved listing access, RESO-shaped provider interfaces, county/role-specific compliance, synchronization, and display-rights boundaries.
2. **Product Layer** — custom website, search UX, consumer-facing pages, lead flows, city/neighborhood pages, and SEO landing pages.
3. **Logic Layer** — lead normalization, contact identity merge/dedupe, attribution, canonical routing, idempotency, notification outbox, workflow assignment, and downstream orchestration.
4. **Utility Layer** — replaceable email, CRM, booking, SMS, analytics, and storage delivery utilities.

Only the Source Layer may depend on external real-estate data vendors. CRM, booking, email, SMS, and analytics are downstream utilities only.

Washington County and Iron County remain independent at the authorization, API credential, policy, sync cursor, health, activation, and kill-switch boundaries. Approved records normalize into the same owned canonical listing model only after those boundaries are enforced.

## Canonical listing path

```txt
approved RESO-shaped source
  -> county-specific source adapter
  -> approved field allowlist
  -> county-specific cursor and sync run
  -> canonical D1 listing cache
  -> internal read service
  -> public search response
```

Visitor searches never call an MLS provider directly. Raw provider records are not exposed to browsers and are not retained in the canonical cache. Media remains disabled until the applicable field/media rights and rules are approved and encoded.

## MLS activation model

Each scope is approved and activated independently:

```txt
washington-idx
washington-vow
iron-idx
iron-vow
```

A scope is live only when all of the following are true:

- approval status is `approved`;
- the explicit enable flag is `true`;
- the recorded policy version matches the code-approved version;
- the approved provider/endpoints are configured; and
- the required server-side credentials are configured.

Credentials alone never activate MLS data. One county or role can never activate another.

The registered production VOW callback is:

```txt
https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback
```

The callback fails closed while approvals, production credentials, token exchange, and local-account linking remain incomplete.

## Lead and notification contract

A valid lead submission creates or reuses exactly one canonical contact and creates exactly one lead event, routing decision, idempotency record, and owner-notification outbox job in one D1 batch. Replays with the same idempotency key return the original result instead of duplicating records.

Owner email delivery occurs after the D1 transaction. Delivery failures remain in D1 for scheduled or manual recovery and never erase the lead. Automated delivery to `buyers@homeinstgeorgeutah.com` is prohibited.

## Apps

```txt
apps/site  Astro public website and search shell
apps/api   Cloudflare Worker API, lead engine, cache sync, and operations
apps/app   React Router dashboard/client/admin foundation
```

## Packages

```txt
packages/config  site, SEO, routes, service-area data, compliance policies
packages/db      D1/SQLite schema and migrations
packages/ui      shared UI primitives
```

## Run locally

```bash
bun install
cp .env.example .env
bun run dev:site
bun run dev:api
bun run dev:app
```

## Validate

```bash
bun run fix
bun run check
bun run test:unit
bun run build:site
bun --filter @home/api typecheck
bun --filter @home/app build
python3 scripts/audit-neighborhood-links.py
python3 scripts/audit-architecture-drift.py
python3 scripts/audit-release.py
```

## D1 migrations

Apply migrations in order only after confirming the target database binding and recording the required backup/restore point:

```bash
bunx wrangler d1 execute homeinstgeorgeutah --file=packages/db/migrations/0001_foundation.sql --config apps/api/wrangler.toml
bunx wrangler d1 execute homeinstgeorgeutah --file=packages/db/migrations/0002_contact_integrity.sql --config apps/api/wrangler.toml
bunx wrangler d1 execute homeinstgeorgeutah --file=packages/db/migrations/0003_mls_scopes.sql --config apps/api/wrangler.toml
bunx wrangler d1 execute homeinstgeorgeutah --file=packages/db/migrations/0004_operational_hardening.sql --config apps/api/wrangler.toml
```

Do not run production migrations until the D1 export/restore drill, rollback procedure, and production backup point are recorded.

## Operations

- `docs/operations/lead-data-governance.md`
- `docs/operations/notification-recovery.md`
- `docs/operations/incident-response.md`
- `docs/operations/mls-activation-runbook.md`

Protected operational routes require the server-side `INTERNAL_JOB_TOKEN`:

```txt
POST /api/internal/notifications/drain
POST /api/internal/mls/sync
POST /api/internal/mls/sync?county=washington
POST /api/internal/mls/sync?county=iron
```

## Guardrails

- Do not scrape old IDX pages.
- Do not copy MLS photos, remarks, listing fields, or listing-detail pages outside approved API/display rules.
- Do not activate Washington County or Iron County based on the other county's approval.
- Do not activate IDX based on VOW approval, or VOW based on IDX approval.
- Do not call an MLS provider from a visitor request.
- Do not make a hosted vendor website the product core.
- Do not make CRM, email, or booking software the source of truth.
- Do not let provider quirks leak into product UI.
- Do not put live API keys, access tokens, client secrets, internal job tokens, or VOW state secrets in source control.
