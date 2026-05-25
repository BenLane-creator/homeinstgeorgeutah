# Cloudflare Worker MLS API Skeleton

## Purpose

This Worker is the backend API layer for the custom Home In St. George MLS search experience.

Production target:

~~~text
homeinstgeorgeutah.com
Cloudflare Pages
Cloudflare Workers
Washington County BOR - IDX
Spark® / RESO Web API
~~~

## Routes

~~~text
GET  /api/health
GET  /api/mls-status
GET  /api/search
GET  /api/listings/:id
POST /api/leads
~~~

## Current state

The Worker is currently a skeleton.

It returns stub responses until Spark® / RESO credentials are configured.

Required production environment:

~~~text
SPARK_API_BASE_URL
SPARK_ACCESS_TOKEN
~~~

Optional future binding:

~~~text
LEADS_KV
~~~

## Compliance notes

Do not scrape old IDX pages.

Do not copy MLS photos, remarks, listing fields, or listing detail pages from the old WordPress site.

Only return/display MLS fields approved by Washington County BOR IDX and Spark® / RESO Web API rules.

Before production launch, verify:

~~~text
- required IDX disclaimers
- listing attribution
- update timestamp display
- field-level display permissions
- photo display permissions
- sold/off-market handling
- caching limits
- rate limits
~~~

## Local development

~~~bash
cd apps/api
bun run dev
~~~

Test locally:

~~~bash
curl http://localhost:8787/api/health
curl "http://localhost:8787/api/search?city=St.%20George&limit=3"
curl http://localhost:8787/api/listings/example-listing-id
~~~
