# Architecture

## Production direction

The site is a full custom Cloudflare build and owned lead engine.

```text
Domain: homeinstgeorgeutah.com
Frontend: Astro public site
Interactive product zones: React islands and future React Router app
Hosting: Cloudflare Pages
Backend/API: Cloudflare Workers
Operational source of truth: Cloudflare D1
File/object storage: Cloudflare R2 where needed
MLS authorization: Washington County BOR - IDX
MLS API: Spark® / RESO Web API through Source Layer adapters
```

## Four-layer architecture

### 1. Source Layer

Contains MLS-approved listing data access, RESO-shaped provider interfaces, provider sync cursors, media/open-house access, display permissions, field visibility rules, disclaimers, attribution requirements, and provider-specific compliance boundaries.

Only this layer may depend on external real estate data vendors.

### 2. Product Layer

Contains the custom public website, custom search UX, map/list/grid pages, property pages, user accounts, saved homes, saved searches, search subscriptions, buyer/seller/relocation pages, city/neighborhood pages, and every user-facing CTA.

### 3. Logic Layer

Contains lead intake normalization, identity merge/dedupe, attribution sessions, routing decisions, workflow assignment, AI enrichment, booking handoff eligibility, CRM sync orchestration, and reporting logic.

### 4. Utility Layer

Contains CRM delivery, booking utilities, email/SMS delivery, analytics exports, and file storage. These systems may distribute, display, or deliver. They may not own canonical records or make routing decisions.

## Apps

```text
apps/site
- Astro frontend
- public content pages
- neighborhood pages
- buyer/seller/relocation pages
- custom MLS search shell
- mobile-first lead CTAs

apps/api
- Cloudflare Worker API
- lead capture
- MLS search proxy
- listing detail proxy
- D1 lead/event persistence
- saved search/account stubs for API-first routing

apps/app
- future dashboard/admin/client portal
```

## Packages

```text
packages/config
- site config
- routes
- SEO helpers
- compliance display policies

packages/db
- D1/SQLite schema and foundation migration

packages/ui
- shared UI components
```

## API-first high-intent actions

Every high-intent action should hit the API first:

```text
request showing
ask about this property
save home
save search
get similar homes
buyer consultation
seller consultation
relocation help
home valuation request
general contact
appointment booking
```

The fixed workflow lane vocabulary is:

```text
seller_high_priority
valuation
buyer_active_search
buyer_early_stage
relocation
property_inquiry
showing_request
general_contact
booked_consult
nurture
```

## Deployment

```text
Cloudflare Pages:
- deploy apps/site/dist

Cloudflare Workers:
- deploy apps/api

Cloudflare D1:
- apply packages/db/migrations/0001_foundation.sql

DNS:
- homeinstgeorgeutah.com -> Cloudflare Pages
- /api/* handled by Workers
```

## Non-goals

```text
No GoDaddy production hosting for the new product
No WordPress production dependency for HomeInStGeorgeUtah.com
No WordPress Flexmls plugin as the primary IDX layer
No hosted website product as the system core
No vendor-owned lead forms as the intake authority
No vendor-owned saved-search logic as the primary account behavior
No CRM as source of truth
No booking tool as workflow engine
No scraping old IDX pages
No copying MLS data outside approved API/display rules
```
