# HomeInStGeorge Project Control

## Active production direction

```text
homeinstgeorgeutah.com
Cloudflare Pages
Cloudflare Workers
Cloudflare D1 as operational source of truth
Cloudflare R2 for assets/downloadables/media caches where permitted
Washington County BOR - IDX
Spark® / RESO Web API through replaceable Source Layer adapters
Custom public search and property experience
Owned lead engine and workflow state
```

## Permanent architecture rule

The system is divided into four layers:

1. Source Layer — MLS-approved listing data access, RESO-shaped provider interfaces, and compliance/display-rights boundary.
2. Product Layer — public website, custom search UX, property pages, accounts, lead flows, saved homes, and saved searches.
3. Logic Layer — lead normalization, identity merge/dedupe, attribution, routing, AI enrichment, booking handoff generation, and CRM sync orchestration.
4. Utility Layer — CRM sink, booking utility, email/SMS delivery, analytics exports, and file storage.

Only the Source Layer may depend on external real estate data vendors. CRM, booking, email, SMS, and analytics are downstream utilities only.

## Production site

```text
https://homeinstgeorgeutah.com
```

## Current app responsibilities

```text
apps/site
- Astro public site
- public content pages
- city/neighborhood pages
- buyer/seller/relocation pages
- custom MLS search shell
- mobile-first lead CTAs

apps/api
- Cloudflare Worker API
- MLS status/search/listing proxy routes
- API-first lead intake
- D1 persistence when DB binding is configured
- workflow lane classification
- attribution/device context capture

apps/app
- future dashboard/admin/client/account zone

packages/config
- site identity, SEO, routes, compliance display policies

packages/db
- D1/SQLite-first schema and foundation migration
```

## Current completed work

- Public Astro site shell
- Homepage
- About
- Buyers
- Sellers
- Contact
- Blog index and blog detail route
- Dynamic neighborhood pages
- 31 neighborhood/service-area MDX files
- Seller financing page
- Horse properties page
- Relocation page
- Custom `/homes/search/` shell
- Mobile sticky action bar
- API-first lead form payload with attribution and device context
- D1 foundation migration scaffold
- Compliance/display policy scaffold
- Source-layer provider contract scaffold

## Next production work

1. Apply `packages/db/migrations/0001_foundation.sql` to Cloudflare D1.
2. Replace the placeholder D1 database id in `apps/api/wrangler.toml`.
3. Configure Spark® / RESO credentials as Worker secrets.
4. Confirm Washington County BOR IDX display permissions, disclaimers, field visibility, media rights, and update timestamp requirements.
5. Connect `/homes/search/` UI to normalized Worker search responses.
6. Build listing detail pages after MLS display permissions are confirmed.
7. Add account/session flows for saved homes, saved searches, and alerts.
8. Add CRM and booking downstream adapters without moving canonical records or routing decisions out of D1.
9. Run build, typecheck, route audit, and architecture drift audit before deployment.

## Guardrails

- Do not scrape old IDX pages.
- Do not copy MLS photos, remarks, listing fields, or listing detail pages from old WordPress/Flexmls output.
- Do not make the CRM the contact database of record.
- Do not make booking software the workflow engine.
- Do not make a vendor-owned search page the main UX.
- Do not let provider-specific MLS quirks leak into product pages.
