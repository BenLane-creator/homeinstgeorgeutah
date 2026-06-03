# Deployment Plan

## Phase 0: backup and staging

1. Keep a complete backup of the current source ZIP before each optimization pass.
2. Keep a rollback copy of the current production site and DNS configuration.
3. Use staging on Cloudflare/benlane.us until redirects, MLS compliance, forms, and API routes are verified.

## Phase 1: Cloudflare source of truth setup

1. Deploy `apps/site` to Cloudflare Pages.
2. Deploy `apps/api` to Cloudflare Workers.
3. Create the Cloudflare D1 database.
4. Apply `packages/db/migrations/0001_foundation.sql`.
5. Replace the placeholder D1 database id in `apps/api/wrangler.toml`.
6. Set Worker secrets for Spark® / RESO and Turnstile.

## Phase 2: launch custom public shell

1. Deploy static pages, neighborhoods, buyer/seller/relocation pages, and `/homes/search/` shell.
2. Verify canonical URLs, sitemap, robots.txt, schema, and redirects all use `homeinstgeorgeutah.com`.
3. Run Playwright smoke tests and route audits.
4. Verify lead forms post to the Worker API and persist in D1.

## Phase 3: MLS search activation

1. Confirm Washington County BOR IDX permissions and Spark® / RESO credentials.
2. Implement provider adapter normalization behind the Source Layer.
3. Apply compliance display rules before exposing fields or media.
4. Add search results, property detail pages, attribution, disclaimers, and update timestamp display.
5. Add saved homes/searches only through first-party account logic.

## Phase 4: downstream utilities

1. Add CRM sync jobs as downstream mirrors only.
2. Add booking handoff creation only after routing decisions are made internally.
3. Add email/SMS delivery infrastructure without moving canonical records out of D1.
4. Add reporting exports from owned D1 data.
