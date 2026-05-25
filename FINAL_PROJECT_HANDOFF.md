# Home In St. George Final Website Project Handoff

## Project Identity

- Website: homeinstgeorge.com
- Staging: benlane.us
- Brand: Home In St. George
- Broker: Joel Robertson
- Company: Robertson Real Estate
- Market: St. George & Southern Utah
- Positioning: Real estate guidance backed by 20+ years of local experience

## Architecture

This is a hybrid website project:

- Astro: public marketing website
- WordPress: Flexmls IDX runtime and content/admin layer where needed
- Flexmls IDX: MLS search, listing results, listing details, saved searches, and lead capture
- Cloudflare Pages: static Astro staging/deployment
- Cloudflare Workers/Hono: future API and routing layer
- React Router: future app/dashboard area only
- Postgres/Drizzle: broker-owned leads, analytics, and app data only

## Critical Flexmls Rule

Do not rebuild, scrape, copy, or store MLS listing data in Astro, Hono, React, or Postgres.

Flexmls must remain inside WordPress unless written approval and technical documentation are provided by the broker, MLS, and Flexmls/FBS for direct API/feed access.

## Main Local Folder

~/Documents/homeinstgeorge-modern-stack

## Key Folders

- apps/site: Astro public website
- apps/api: Hono Cloudflare Worker API scaffold
- apps/app: React Router future app/dashboard scaffold
- packages/config: site config, routes, SEO, service-area data
- packages/ui: shared UI primitives
- packages/db: Drizzle/Postgres future schema layer
- docs: architecture, routing, QA, rollback notes
- tests/e2e: Playwright smoke tests

## Important Commands

Install dependencies:

    bun install

Run local dev site:

    bun run dev:site

Build public site:

    bun run build:site

Static deploy folder:

    apps/site/dist

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
- Search homes handoff page
- Seller financing page, if present
- Horse properties page, if present

## Current Staging

https://benlane.us

Do not point homeinstgeorge.com to the Astro site until WordPress/Flexmls routing, IDX paths, redirects, and launch QA are finalized.

## Production Routing Goal

- homeinstgeorge.com: Astro public marketing site
- homeinstgeorge.com/homes/*: WordPress/Flexmls IDX enclave
- homeinstgeorge.com/st-george-homes-for-sale/*: existing indexed Flexmls path; preserve or redirect carefully
- wp.homeinstgeorge.com: WordPress admin and Flexmls origin
- homeinstgeorge.com/api/*: Hono Cloudflare Worker API, future

## Final Source Bundle

Use:

    homeinstgeorge-modern-stack-final-source.zip

The final ZIP should exclude:

- node_modules
- dist
- .astro
- .wrangler
- .git
- backup files ending in .bak
- temporary files containing .before-

## Next Work

1. Finish visible copy pass on remaining pages.
2. Confirm all nav links use the correct trailing-slash behavior.
3. Create redirect map from old WordPress URLs.
4. Preserve existing Flexmls IDX paths.
5. Add SEO/schema polish.
6. Finalize lead form routing.
7. Prepare production Cloudflare routing.
8. QA on desktop and mobile before launch.
