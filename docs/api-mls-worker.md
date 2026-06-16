# Cloudflare Worker MLS API

## Purpose

This Worker is the backend API layer for the custom HomeInStGeorgeUtah.com search and lead engine.

Production target:

```text
homeinstgeorgeutah.com
Mobile-first public UX
Near-zero monthly cost by default
Cloudflare Pages where static-first delivery is optimal
Cloudflare Workers for API and owned logic
Cloudflare D1 as operational source of truth
Cloudflare R2 for assets, files, generated objects, and permitted media caches
Washington County MLS + Iron County MLS
Spark® / RESO Web API through replaceable Source Layer adapters
```

## Current routes

```text
GET  /api/health
GET  /api/mls-status
GET  /api/search
GET  /api/listings/:id
POST /api/leads

GET  /api/v1/health
GET  /api/v1/mls-status
GET  /api/v1/search/execute
GET  /api/v1/search/map
GET  /api/v1/listings/:id
POST /api/v1/leads/intake
POST /api/v1/valuation/request
POST /api/v1/properties/inquiry
POST /api/v1/properties/showing
POST /api/v1/search/save
POST /api/v1/homes/save
POST /api/v1/alerts/subscribe
POST /api/v1/bookings/create-handoff
```

## Current state

The Worker returns stub search/listing responses until Spark® / RESO credentials are configured.

Lead intake validates payloads, captures attribution/device context, classifies workflow lane, and persists to D1-backed contacts, attribution sessions, property context, lead events, and routing decisions. Production lead writes require the `DB` binding.

Required production environment:

```text
DB D1 binding
API_WRITE_ORIGINS
```

Source Layer configuration:

```text
SPARK_API_BASE_URL
SPARK_ACCESS_TOKEN secret
MLS_PROVIDER_NAME optional
```

Production write/security configuration:

```text
API_WRITE_ORIGINS
TURNSTILE_SECRET_KEY secret
```

## Compliance notes

Do not scrape old IDX pages.

Do not copy MLS photos, remarks, listing fields, or listing detail pages from the old WordPress site.

Only return/display MLS fields approved by Washington County MLS, Iron County MLS, Spark® / RESO Web API, and applicable FBS/Flexmls rules.

Before production launch, verify:

```text
- required IDX disclaimers
- listing attribution
- update timestamp display
- field-level display permissions
- public vs registered-user gating
- VOW/authenticated-user requirements
- photo/media display permissions
- sold/off-market handling
- caching limits
- rate limits
- abuse protection
```

## Local development

```bash
cd apps/api
bun run dev
```

Test locally:

```bash
curl http://localhost:8787/api/health
curl "http://localhost:8787/api/v1/search/execute?city=St.%20George&limit=3"
curl http://localhost:8787/api/listings/example-listing-id
```
