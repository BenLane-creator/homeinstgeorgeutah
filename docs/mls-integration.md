# MLS / IDX Integration Plan

## Current project decision

The production site will not be a GoDaddy / WordPress hybrid.

The target production architecture is:

~~~text
homeinstgeorgeutah.com
Cloudflare Pages
Cloudflare Workers
Custom Astro frontend
Washington County BOR - IDX
Spark® / RESO Web API
~~~

## MLS access model

Primary MLS authorization:

~~~text
Washington County BOR - IDX
~~~

Primary MLS data/API layer:

~~~text
Spark® / RESO Web API
~~~

## What this replaces

This supersedes the earlier plan to preserve a WordPress/Flexmls IDX runtime as the primary search layer.

The previous references to:

~~~text
/st-george-homes-for-sale/
/st-george-homes-for-sale/search/
WordPress Flexmls plugin
GoDaddy-hosted IDX handoff
~~~

are no longer the production target.

Those paths may still be useful for historical SEO/reference analysis, but they should not drive the new technical architecture.

## New IDX/search architecture

The new custom site should expose:

~~~text
/homes/search/
/homes/[listing-id]/
/api/search
/api/listings/[listing-id]
~~~

The frontend should query Cloudflare Workers, and Workers should communicate with Spark® / RESO Web API according to Washington County BOR IDX rules.

## Compliance guardrails

Do not scrape old IDX pages.

Do not copy MLS photos, remarks, listing fields, or listing detail pages from the old WordPress site.

Only display MLS data through approved IDX/Web API access, following Washington County BOR, Spark/FBS, and RESO display rules.

## Cloudflare Worker responsibilities

~~~text
/api/search
- receive search params
- validate params
- call Spark/RESO API
- normalize response for frontend
- apply rate limiting/cache rules
- return allowed IDX fields only

/api/listings/:id
- fetch listing detail from Spark/RESO
- return permitted listing fields
- handle unavailable/expired/off-market results correctly

/api/leads
- capture buyer/seller inquiries
- store/send lead
- preserve source/route/listing context

/api/saved-searches
- future phase
- buyer account/saved-search behavior if permitted
~~~

## Frontend responsibilities

~~~text
/homes/search/
- custom search UI
- map/list/grid display if allowed
- city/neighborhood filters
- price/bed/bath filters
- lead capture CTA
- saved search CTA

/homes/[listing-id]/
- custom listing detail page if permitted by IDX/API agreement
- MLS-required disclaimers
- listing attribution
- update timestamp
- data-source attribution
~~~

## Launch domain

~~~text
homeinstgeorgeutah.com
~~~

Staging may continue on:

~~~text
benlane.us
~~~

until production DNS is ready.
