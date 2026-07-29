# HomeInStGeorgeUtah Modern Stack

This repository implements the custom HomeInStGeorgeUtah.com website, owned lead engine, owned canonical listing cache, and broker-controlled consumer account.

## Production direction

```txt
homeinstgeorgeutah.com             -> Astro public site on Cloudflare Pages
homeinstgeorgeutah.com/api/*       -> Cloudflare Worker API
Cloudflare D1                      -> operational and listing-cache source of truth
MLS-approved API access            -> replaceable RESO-shaped source adapters
Washington County IDX + VOW        -> independent authorization/display scope
Iron County IDX + VOW              -> independent authorization/display scope
```

All four MLS subscriptions remain disabled in repository defaults. A pending, incomplete, denied, suspended, or explicitly disabled scope never enables listing or VOW access.

## Architecture rule

The system is divided into four layers:

1. **Source Layer** — MLS-approved listing access, RESO-shaped provider interfaces, county/role-specific compliance, synchronization, and display-rights boundaries.
2. **Product Layer** — custom website, search UX, consumer account, saved homes/searches, lead flows, city/neighborhood pages, and SEO landing pages.
3. **Logic Layer** — lead normalization, contact identity merge/dedupe, attribution, canonical routing, idempotency, account/session authorization, notification outbox, workflow assignment, and downstream orchestration.
4. **Utility Layer** — replaceable email, CRM, booking, SMS, analytics, and storage delivery utilities.

Only the Source Layer may depend on external real-estate data vendors. CRM, booking, email, SMS, and analytics are downstream utilities only.

Washington County and Iron County remain independent at the authorization, API credential, policy, sync cursor, account grant, health, activation, and kill-switch boundaries. Approved records normalize into the same owned canonical listing model only after those boundaries are enforced.

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

## Consumer account contract

The VOW account path uses a county-specific authorization-code flow with signed state, S256 PKCE, verified issuer/audience/expiry/nonce claims, and configured JWKS signature verification. Provider access and refresh tokens are encrypted before D1 storage. Local sessions use revocable, hashed, `HttpOnly`, `Secure`, `SameSite=Lax` cookies.

A consumer may save a home or search only when that account has an active grant for the listing/search county. Washington authorization never creates an Iron grant, and Iron authorization never creates a Washington grant.

```txt
GET    /api/v1/auth/flexmls/start?county=washington|iron
GET    /api/v1/auth/flexmls/callback
POST   /api/v1/auth/logout
GET    /api/v1/account/session
GET    /api/v1/account/saved-homes
POST   /api/v1/account/saved-homes
DELETE /api/v1/account/saved-homes/:id
GET    /api/v1/account/saved-searches
POST   /api/v1/account/saved-searches
DELETE /api/v1/account/saved-searches/:id
```

Authorization start fails closed unless the selected county VOW scope passes its full approval, policy, endpoint, credential, and enablement contract.

## Lead and notification contract

A valid lead submission creates or reuses exactly one canonical contact and creates exactly one lead event, routing decision, idempotency record, and owner-notification outbox job in one D1 batch. Replays with the same idempotency key return the original result instead of duplicating records.

Owner email delivery occurs after the D1 transaction. Delivery failures remain in D1 for scheduled or manual recovery and never erase the lead. Automated delivery to `buyers@homeinstgeorgeutah.com` is prohibited.

## Apps

```txt
apps/site  Astro public website, search, and consumer-account UI
apps/api   Cloudflare Worker API, lead engine, account service, cache sync, and operations
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
python3 scripts/audit-production-workflows.py
```

## D1 migrations

Wrangler tracks the versioned SQL files in `packages/db/migrations`. Never apply an individual migration file with `d1 execute`.

List and apply every pending migration against a disposable local D1 database, then run the migration/upsert proof used by CI:

```bash
bunx wrangler d1 migrations list homeinstgeorgeutah --local --config apps/api/wrangler.toml
bunx wrangler d1 migrations apply homeinstgeorgeutah --local --config apps/api/wrangler.toml
bash scripts/test-d1-migrations.sh
```

Production migration, Worker deployment, and Pages deployment are one exact-SHA stop/go procedure. Follow `docs/operations/production-release.md`. The manual workflow records a D1 Time Travel bookmark, exports and locally restores the database, encrypts the export, applies migrations, deploys both runtime surfaces from the same SHA, and runs fail-closed production smoke tests.

## Operations

- `docs/operations/production-release.md`
- `docs/operations/prelaunch-go-no-go.md`
- `docs/operations/lead-data-governance.md`
- `docs/operations/notification-recovery.md`
- `docs/operations/incident-response.md`
- `docs/operations/mls-activation-runbook.md`
- `docs/operations/d1-production-migration.md`

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
- Do not call an MLS provider from a visitor search request.
- Do not grant saved-home/search access without the matching county VOW grant.
- Do not make a hosted vendor website the product core.
- Do not make CRM, email, or booking software the source of truth.
- Do not let provider quirks leak into product UI.
- Do not put live API keys, access tokens, client secrets, internal job tokens, backup passphrases, state secrets, or token-encryption secrets in source control.
