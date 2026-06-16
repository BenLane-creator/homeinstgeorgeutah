# HomeInStGeorge Project Control

## Active production direction

```text
homeinstgeorgeutah.com
Mobile-first public UX
Near-zero monthly cost by default
Cloudflare as preferred infrastructure base
Cloudflare Pages for static-first public delivery where optimal
Cloudflare Workers for API and owned logic
Cloudflare D1 as operational source of truth
Cloudflare R2 for assets, downloadables, generated files, and permitted media caches
Cloudflare KV, Queues, and Durable Objects only where they are the best fit
Washington County MLS + Iron County MLS
Spark® / RESO Web API through replaceable Source Layer adapters
Custom public search and property experience
Owned lead engine, contact history, attribution, routing, and workflow state
```

## Stack rule

Use the best owned, portable, mobile-first, near-zero-cost tool for each layer. Framework choices are not fixed by preference. They are chosen by fit, cost, speed, ownership, simplicity, compliance control, and long-term portability.

The current public site may remain static-first where that gives the fastest mobile SEO pages at the lowest cost. React/Vite/React Router should be used where richer app-state UX is justified, such as search, map, saved homes, accounts, alerts, comparison, dashboard, and authenticated flows. Hono should be used only where it improves Worker API maintainability. Cloudflare remains the preferred infrastructure base unless another option improves ownership, portability, simplicity, and cost.

## Permanent architecture rule

The system is divided into four layers:

1. Source Layer — MLS-approved listing data access, RESO-shaped provider interfaces, provider adapters, sync logic, and compliance/display-rights boundaries.
2. Product Layer — public website, custom search UX, property pages, accounts, lead flows, saved homes, saved searches, alerts, and content/SEO pages.
3. Logic Layer — lead normalization, identity merge/dedupe, attribution, routing, AI enrichment, booking handoff generation, CRM sync orchestration, scoring, reporting, and workflow state.
4. Utility Layer — CRM sink, booking utility, email/SMS delivery, analytics exports, file/media delivery, and storage.

Only the Source Layer may depend on MLS/Flexmls/Spark/RESO provider code. CRM, booking, email, SMS, analytics, and other external services are downstream utilities only. They may distribute, deliver, or sync; they may not own canonical records, routing decisions, lead history, saved homes/searches, reporting, or conversion state.

## Production site

```text
https://homeinstgeorgeutah.com
```

## Current app responsibilities

```text
apps/site
- Astro/static-first public site where optimal
- public content pages
- city/neighborhood pages
- buyer/seller/relocation pages
- custom MLS search shell
- mobile-first lead CTAs
- public SEO pages optimized for speed and low cost

apps/api
- Cloudflare Worker API
- MLS status/search/listing proxy routes
- API-first lead intake
- D1-backed contact, attribution, property context, lead event, and routing decision persistence
- workflow lane classification
- attribution/device context capture
- write-response security headers
- optional Turnstile verification when configured

apps/app
- future dashboard/admin/client/account zone
- future richer React/app-state surfaces if justified

packages/config
- site identity, SEO, routes, compliance display policies

packages/db
- D1/SQLite-first schema and migrations
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
- D1-backed lead intake foundation for contacts, attribution sessions, property context, lead events, and routing decisions
- Explicit workflow lane classification
- Duplicate-email contact merge/upsert behavior
- Local D1 schema verification script
- Local lead smoke testing
- Guarded smoke cleanup script
- Remote-readiness schema verification script
- Origin-aware write CORS
- `Cache-Control: no-store` for lead/write responses
- Optional server-side Turnstile verification when `TURNSTILE_SECRET_KEY` is configured
- Compliance/display policy scaffold
- Source-layer provider contract scaffold
- Spark/RESO provider scaffolding
- Normalized search/listing DTO direction
- Architecture drift audit
- Neighborhood link audit

## Current unresolved production items

- Remote D1 schema must be verified read-only before controlled production writes.
- No remote migration should be applied without explicit authorization.
- No production test lead should be submitted until remote D1 schema and Worker route are confirmed.
- Spark/RESO credentials are not complete for live MLS results.
- MLS/FBS display rules, field visibility, media rights, attribution, disclaimers, VOW gating, and caching rights still need confirmation before live listing display.
- Frontend Turnstile token submission still needs to be wired before enforcing Turnstile in production.
- Real rate limiting/abuse protection still needs implementation beyond the placeholder.
- CRM sync, booking handoff, email/SMS delivery, saved homes/searches, accounts, alerts, reporting, and dashboard flows are not complete.

## Next production work

1. Verify remote D1 lead-engine schema read-only before any production write or migration.
2. If remote schema is missing, back up/export production D1 if needed and apply migrations only during an explicitly authorized controlled window.
3. Confirm Worker deployment target and API route behavior.
4. Configure allowed production write origins with `API_WRITE_ORIGINS`.
5. Configure frontend Turnstile token submission and production `TURNSTILE_SECRET_KEY` only when ready to enforce.
6. Run one controlled production test lead only after remote D1 schema and Worker route are verified.
7. Query D1 for that test lead across contacts, attribution sessions, property context, lead events, and routing decisions.
8. Clean controlled test lead data only if cleanup is explicitly authorized.
9. Configure Spark® / RESO credentials as Worker secrets only after access and display rules are confirmed.
10. Confirm Washington County MLS + Iron County MLS display permissions, disclaimers, field visibility, media rights, update timestamp requirements, VOW requirements, and caching limits.
11. Connect `/homes/search/` UI to normalized Worker search responses after MLS compliance rules are confirmed.
12. Build listing detail pages after MLS display permissions are confirmed.
13. Add account/session flows for saved homes, saved searches, alerts, compare homes, and authenticated inventory where legal.
14. Add CRM and booking downstream adapters without moving canonical records or routing decisions out of D1.
15. Add email/SMS delivery infrastructure as delivery only, not canonical workflow state.
16. Add reporting from owned D1 data.
17. Run build, typecheck, test, route audit, architecture drift audit, and neighborhood link audit before deployment.

## Guardrails

- Do not scrape old IDX pages.
- Do not copy MLS photos, remarks, listing fields, or listing detail pages from old WordPress/Flexmls output.
- Do not display MLS data outside approved MLS/FBS/Spark/RESO rules.
- Do not cache MLS fields, media, remarks, status, history, or VOW-only data unless rights and retention rules are confirmed.
- Do not make the CRM the contact database of record.
- Do not make booking software the workflow engine.
- Do not make a vendor-owned search page the main UX.
- Do not let provider-specific MLS quirks leak into product or logic code.
- Do not run remote migrations, production writes, deployments, DNS changes, cleanup, or MLS credential changes without explicit authorization.
- Do not add paid infrastructure unless it improves ownership, compliance, conversion, reliability, or simplicity enough to justify the cost.
- Keep public UX mobile-first.
- Keep early operating cost as close to zero as possible.
