# HomeInStGeorgeUtah Website Project Handoff

## Project identity

- Website: `homeinstgeorgeutah.com`
- Prelaunch/staging reference: `benlane.us`
- Brand: Home In St. George
- Broker: Joel Robertson
- Company: Robertson Real Estate
- Market: St. George and Southern Utah
- Positioning: real estate search and local guidance backed by 20+ years of local experience

## Current release state

The repository is the implementation source of truth.

Current state: **NO-GO for public launch until the applicable production evidence and approvals in `docs/operations/prelaunch-go-no-go.md` are complete.**

Two release states must remain distinct:

1. **Foundation prelaunch** — public content, owned lead intake, D1, account/search foundations, prelaunch crawler controls, and honest disabled MLS states.
2. **Final product launch** — approved dual-MLS IDX/VOW data, encoded display rules, first-party property experiences, account capabilities, alerts, operational delivery, and final indexing approval.

A successful foundation deployment does not mean the Final Website Project is complete.

## Implemented architecture

This repository currently uses:

- Astro for the public website, SEO pages, content pages, and search shell
- React islands for forms, search results, and consumer account UI
- React Router for the separate authenticated/internal application zone
- Cloudflare Workers for API routes, owned lead intake, cache search, MLS synchronization, VOW authorization, and downstream orchestration
- Cloudflare D1 as the operational source of truth
- Washington and Iron County IDX/VOW scopes behind independent fail-closed activation controls

The current hybrid Astro/React implementation is intentional unless the authoritative architecture specification is separately amended to require a rewrite.

## Critical MLS rule

Do not scrape, duplicate, copy, or display MLS content outside executed MLS/API/display terms.

Listing data must pass through:

1. the approved provider adapter;
2. county- and role-specific activation controls;
3. the canonical D1 cache;
4. the display/compliance boundary;
5. the first-party product UI.

All four scopes remain disabled until authorization, credentials, policy versions, field/media rules, and controlled tests are complete.

## Key folders

- `apps/site`: Astro public website
- `apps/api`: Cloudflare Worker API and owned operating logic
- `apps/app`: React Router authenticated/internal zone
- `packages/config`: site, route, SEO, service-area, and compliance configuration
- `packages/db`: D1 schema reference and versioned SQL migrations
- `packages/ui`: shared UI primitives
- `docs`: architecture, activation, release, rollback, governance, and QA records
- `scripts`: release audits, migration tests, and production verification helpers
- `tests/e2e`: Playwright browser, mobile, route, and accessibility smoke tests

## Important commands

```bash
bun install --frozen-lockfile
bun run dev:site
bun run dev:api
bun run build:site
bun run check
bun --filter @home/api typecheck
bun test apps/api/src
bash scripts/test-d1-migrations.sh
python3 scripts/audit-architecture-drift.py
python3 scripts/audit-release.py
python3 scripts/audit-production-workflows.py
bun run test:e2e
bun --filter @home/app build
```

## Implemented product areas

- Homepage and primary brokerage pages
- Blog/market-guide and neighborhood content
- Responsive mobile navigation and sticky action bar
- Canonical metadata, schema, sitemap, true 404, and prelaunch crawler controls
- Accessible shared lead forms
- Origin checks, request minimization, rate limiting, idempotency, consent, and strict Turnstile verification
- Transactional D1 lead intake and recoverable notification outbox
- Washington/Iron county search selector and cache-only search results
- Honest unavailable states while IDX is disabled
- Independent Washington/Iron IDX/VOW activation gates
- VOW OAuth/account foundation, encrypted provider tokens, first-party sessions, saved homes, and saved searches
- Exact-SHA release, encrypted D1 backup, migration verification, deployment evidence, and application rollback workflows

## Production blockers before foundation release

1. Release QA must pass on one immutable SHA from `main`.
2. The read-only production preflight must prove Cloudflare account, D1 identity, migration parity, Worker state, approved secret names, root-domain API routing, and disabled MLS scopes.
3. The Pages project must have one documented production deployment authority.
4. The owner-notification delivery webhook and token must be configured and tested.
5. The production release must complete backup, restore drill, migrations, Worker/Pages deployment, metadata verification, and smoke tests.
6. One controlled production lead must create exactly one canonical record set and exactly one delivered owner notification.
7. Rollback must be rehearsed without automatically restoring D1.
8. Broker/legal content approval and technical-owner signoff must be recorded.

## Final Website Project work remaining

- Executed Washington and Iron IDX/VOW approvals and credentials
- Encoded county-specific field, media, attribution, refresh, cache, and kill-switch rules
- Approved-data synchronization tests
- First-party listing detail and open-house pages
- Map search where permitted
- VOW terms acceptance and reauthorization/refresh lifecycle
- Alert execution and delivery
- Inquiry and showing-request histories
- Booking handoff implementation
- HubSpot synchronization
- Reporting and conversion implementation
- Final production SEO, performance, accessibility, and indexing approval

## Production routing goal

```text
homeinstgeorgeutah.com             -> Astro public website
homeinstgeorgeutah.com/homes/*     -> first-party search and property experience
homeinstgeorgeutah.com/api/*       -> Cloudflare Worker API
```

Do not enable indexing or live MLS data as part of a foundation release.
