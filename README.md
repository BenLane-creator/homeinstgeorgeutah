# HomeInStGeorgeUtah Modern Stack

This repository implements the custom HomeInStGeorgeUtah.com website and owned lead engine.

## Production direction

```txt
homeinstgeorgeutah.com             -> Astro public site on Cloudflare Pages
homeinstgeorgeutah.com/api/*       -> Cloudflare Worker API
Cloudflare D1                      -> operational source of truth
MLS-approved API access            -> replaceable RESO-shaped Source Layer adapters
Washington County IDX + VOW        -> independent authorization/display scope
Iron County IDX + VOW              -> independent authorization/display scope
```

All four MLS subscriptions are currently pending. Pending status never enables live listing or VOW access.

## Architecture rule

The system is divided into four layers:

1. **Source Layer** — MLS-approved listing access, RESO-shaped provider interfaces, media/open-house access, and county/role-specific compliance and display-rights boundaries.
2. **Product Layer** — custom website, search UX, property pages, accounts, saved homes/searches, lead flows, city/neighborhood pages, and SEO landing pages.
3. **Logic Layer** — lead normalization, contact identity merge/dedupe, attribution, routing decisions, workflow assignment, AI enrichment, booking handoff generation, and CRM sync orchestration.
4. **Utility Layer** — CRM sink, booking utility, email/SMS delivery, analytics exports, and file/object storage.

Only the Source Layer may depend on external real estate data vendors. CRM, booking, email, SMS, and analytics are downstream utilities only.

Washington County and Iron County must remain independent at the authorization, API credential, policy, sync cursor, health, activation, and kill-switch boundaries. They may normalize into the same owned canonical listing model after those boundaries are enforced.

## MLS activation model

Each of these scopes must be approved and activated independently:

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

The callback currently fails closed while approvals, production credentials, token exchange, and local-account linking remain incomplete.

## Apps

```txt
apps/site  Astro public website and search shell
apps/api   Cloudflare Worker API and lead engine
apps/app   Future React Router dashboard/client/admin zone
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
```

## D1 migrations

Apply migrations in order after creating the Cloudflare D1 database and confirming the database binding in `apps/api/wrangler.toml`:

```bash
bunx wrangler d1 execute homeinstgeorgeutah --file=packages/db/migrations/0001_foundation.sql --config apps/api/wrangler.toml
bunx wrangler d1 execute homeinstgeorgeutah --file=packages/db/migrations/0002_contact_integrity.sql --config apps/api/wrangler.toml
bunx wrangler d1 execute homeinstgeorgeutah --file=packages/db/migrations/0003_mls_scopes.sql --config apps/api/wrangler.toml
```

Do not run production migrations until the backup/restore point and rollback procedure are recorded.

## Guardrails

- Do not scrape old IDX pages.
- Do not copy MLS photos, remarks, listing fields, or listing-detail pages outside approved API/display rules.
- Do not activate Washington County or Iron County based on the other county's approval.
- Do not activate IDX based on VOW approval, or VOW based on IDX approval.
- Do not make a hosted vendor website the product core.
- Do not make CRM the source of truth.
- Do not make booking software the workflow engine.
- Do not let provider quirks leak into product UI.
- Do not put live API keys, access tokens, client secrets, or VOW state secrets in source control.
