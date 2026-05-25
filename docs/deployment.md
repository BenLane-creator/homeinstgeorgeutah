# Deployment Plan

## Phase 0: backup and staging

1. Full backup of current WordPress files and database.
2. Create staging clone.
3. Verify current Flexmls search/results/details/forms on staging.

## Phase 1: origin split

1. Put WordPress at `wp.homeinstgeorge.com` or keep current host behind Cloudflare route.
2. Keep admin at WordPress origin.
3. Set `homeinstgeorge.com` to Cloudflare/Astro only after testing.

## Phase 2: launch Astro shell

1. Deploy `apps/site` to Cloudflare.
2. Configure env vars.
3. Add route or redirect for `/homes/*` to WordPress/Flexmls.
4. Run Playwright smoke tests.

## Phase 3: improve app/data layer

1. Connect Postgres.
2. Enable Drizzle migrations.
3. Store non-IDX lead and analytics events.
4. Add Sentry/OpenTelemetry.
