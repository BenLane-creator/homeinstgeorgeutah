# HomeInStGeorgeUtah Modern Stack

This repository implements the custom HomeInStGeorgeUtah.com website and owned lead engine.

## Production direction

```txt
homeinstgeorgeutah.com             -> Astro public site on Cloudflare Pages
homeinstgeorgeutah.com/api/*       -> Cloudflare Worker API
Cloudflare D1                      -> operational source of truth
Spark® / RESO Web API              -> MLS-approved Source Layer access
Washington County MLS + Iron County MLS        -> MLS authorization/display rules
```

## Architecture rule

The system is divided into four layers:

1. **Source Layer** — MLS-approved listing access, RESO-shaped provider interfaces, media/open-house access, and compliance/display-rights boundary.
2. **Product Layer** — custom website, search UX, property pages, accounts, saved homes/searches, lead flows, city/neighborhood pages, and SEO landing pages.
3. **Logic Layer** — lead normalization, contact identity merge/dedupe, attribution, routing decisions, workflow assignment, AI enrichment, booking handoff generation, and CRM sync orchestration.
4. **Utility Layer** — CRM sink, booking utility, email/SMS delivery, analytics exports, and file/object storage.

Only the Source Layer may depend on external real estate data vendors. CRM, booking, email, SMS, and analytics are downstream utilities only.

## Apps

```txt
apps/site  Astro public website and search shell
apps/api   Cloudflare Worker API and lead engine
apps/app   Future React Router dashboard/client/admin zone
```

## Packages

```txt
packages/config  site, SEO, routes, service-area data, compliance policies
packages/db      D1/SQLite schema and foundation migration
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
bun run build:site
bun --filter @home/api typecheck
bun --filter @home/app build
python3 scripts/audit-neighborhood-links.py
python3 scripts/audit-architecture-drift.py
```

## D1 migration

Apply the foundation schema after creating the Cloudflare D1 database and replacing the placeholder database id in `apps/api/wrangler.toml`:

```bash
bunx wrangler d1 execute homeinstgeorgeutah --file=packages/db/migrations/0001_foundation.sql --config apps/api/wrangler.toml
```

## Guardrails

- Do not scrape old IDX pages.
- Do not copy MLS photos, remarks, listing fields, or listing detail pages outside approved API/display rules.
- Do not make a hosted vendor website the product core.
- Do not make CRM the source of truth.
- Do not make booking software the workflow engine.
- Do not let provider quirks leak into product UI.
