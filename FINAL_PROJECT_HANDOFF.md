# HomeInStGeorgeUtah Final Website Project Handoff

## Project Identity

- Website: homeinstgeorgeutah.com
- Staging: benlane.us
- Brand: Home In St. George
- Broker: Joel Robertson
- Company: Robertson Real Estate
- Market: St. George & Southern Utah
- Positioning: real estate search and local guidance backed by 20+ years of local experience

## Architecture

This is a custom Cloudflare website and owned lead engine:

- Astro: public website, SEO pages, content pages, and custom search shell
- React islands: lead forms and targeted interactive UI
- React Router: future dashboard/client/internal app zone
- Cloudflare Workers: API, MLS proxy routes, lead intake, workflow routing, and downstream orchestration
- Cloudflare D1: operational source of truth for contacts, lead events, routing decisions, attribution, saved homes/searches, and reporting state
- Cloudflare R2: future assets, downloadable guides, cached media where permitted, and generated files
- Washington County BOR IDX + Spark® / RESO Web API: approved MLS Source Layer access

## Critical MLS rule

Do not scrape, duplicate, copy, or locally display MLS listing content outside the approved MLS/API/display rules. Listing data must pass through the Source Layer adapter and compliance/display boundary before product pages render it.

## Main Local Folder

```text
~/Documents/realtor-site
```

or the current extracted monorepo root containing:

```text
apps/
packages/
docs/
scripts/
package.json
```

## Key Folders

- `apps/site`: Astro public website
- `apps/api`: Cloudflare Worker API and owned lead intake
- `apps/app`: React Router future dashboard/client/admin zone
- `packages/config`: site config, routes, SEO, service-area data, compliance display policy
- `packages/db`: D1/SQLite schema and migration
- `packages/ui`: shared UI primitives
- `docs`: architecture, routing, QA, rollback, and optimization notes
- `tests/e2e`: Playwright smoke tests

## Important Commands

```bash
bun install
bun run dev:site
bun run dev:api
bun run build:site
bun run fix
bun run check
bun --filter @home/api typecheck
bun --filter @home/app build
python3 scripts/audit-architecture-drift.py
```

## Known Working Areas

- Homepage
- About page
- Buyers page
- Sellers page
- Contact page
- Blog index
- Blog detail pages
- Neighborhood index
- Dynamic neighborhood/service-area pages
- Search homes shell
- Seller financing page
- Horse properties page
- Relocation page
- Mobile sticky action bar
- API-first lead form payload with attribution/device context
- D1 foundation migration scaffold

## Current Staging

```text
https://benlane.us
```

Do not point production DNS to the new Cloudflare build until API routes, MLS compliance, D1 binding, redirects, SEO, forms, and rollback are verified.

## Production Routing Goal

```text
homeinstgeorgeutah.com             -> Astro public website
homeinstgeorgeutah.com/homes/*     -> custom Product Layer search and property experience
homeinstgeorgeutah.com/api/*       -> Cloudflare Worker API
```

## Final Source Bundle

The optimized ZIP should exclude:

- node_modules
- dist
- .astro
- .wrangler
- .git
- backup files ending in .bak
- temporary files containing .before-

## Next Work

1. Apply the D1 migration.
2. Replace the placeholder D1 database id.
3. Configure Spark® / RESO Worker secrets.
4. Confirm Washington County BOR IDX display rules.
5. Connect `/homes/search/` to normalized Worker search results.
6. Build property pages only after approved display fields/media rules are confirmed.
7. Add accounts, saved homes, saved searches, and alerts.
8. Add CRM and booking adapters as downstream utilities only.
9. QA desktop/mobile, SEO, schema, redirects, forms, and rollback.
