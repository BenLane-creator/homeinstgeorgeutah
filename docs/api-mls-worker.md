# Cloudflare Worker MLS API

## Purpose

This Worker is the backend API layer for the custom HomeInStGeorgeUtah.com search and lead engine.

Production target:

```text
homeinstgeorgeutah.com
Cloudflare Pages
Cloudflare Workers
Cloudflare D1
Washington County BOR - IDX
Spark® / RESO Web API
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

Lead intake validates payloads, captures attribution/device context, classifies workflow lane, and persists to D1 when the `DB` binding is configured. If D1 is not bound, it can fall back to `LEADS_KV` for local/dev only.

Required production environment:

```text
SPARK_API_BASE_URL
SPARK_ACCESS_TOKEN secret
DB D1 binding
```

Recommended production security:

```text
API_WRITE_ORIGINS
TURNSTILE_SECRET_KEY secret
```

## Compliance notes

Do not scrape old IDX pages.

Do not copy MLS photos, remarks, listing fields, or listing detail pages from the old WordPress site.

Only return/display MLS fields approved by Washington County BOR IDX and Spark® / RESO Web API rules.

Before production launch, verify:

```text
- required IDX disclaimers
- listing attribution
- update timestamp display
- field-level display permissions
- public vs registered-user gating
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
