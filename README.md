# HomeInStGeorge Modern Hybrid Stack

This repository implements the safe hybrid architecture for `homeinstgeorge.com`:

- **Astro** owns the modern public marketing website.
- **WordPress** remains the content system and the required host for the **Flexmls IDX WordPress plugin**.
- **Flexmls IDX** handles MLS search, listing results, listing details, lead capture, saved searches, and account/portal behavior.
- **Cloudflare Workers/Hono** handle API routes, lead intake, safe redirects/proxy logic, analytics events, and edge routing.
- **React Router v7 Framework Mode** is reserved for real app zones such as dashboard, client portal, internal lead tools, or future account flows.

## Non-negotiable Flexmls rule

Do not try to recreate MLS search/results/listing detail pages in Astro unless the broker gets written approval for a direct feed or approved API access. The current safe pattern is to keep Flexmls inside WordPress and make the custom site route users into the WordPress/Flexmls enclave.

## Intended deployment shape

```txt
homeinstgeorge.com                  -> Astro marketing site on Cloudflare Pages/Workers
homeinstgeorge.com/homes/*          -> proxied or redirected to WordPress/Flexmls IDX
wp.homeinstgeorge.com               -> WordPress admin/content/IDX origin, no casual public browsing needed
homeinstgeorge.com/app/*            -> React Router app zone, optional/future
homeinstgeorge.com/api/*            -> Hono Worker API
```

## Apps

```txt
apps/site  Astro marketing website
apps/api   Hono Cloudflare Worker API
apps/app   React Router v7 app zone
```

## Packages

```txt
packages/ui      shared shadcn-style primitives
packages/db      Drizzle schema and database helpers
packages/config  site, SEO, navigation, and route config
```

## Run locally

```bash
bun install
cp .env.example .env
bun run dev:site
bun run dev:api
bun run dev:app
```

## First implementation phase

1. Keep current WordPress live until a full backup exists.
2. Move/clone WordPress to a staging or origin subdomain.
3. Confirm Flexmls pages work on WordPress before routing from Astro.
4. Launch Astro marketing pages.
5. Route `/homes/*` to the WordPress/Flexmls enclave.
6. Test search, results, details, lead forms, saved search, account, mobile, and disclaimers.

