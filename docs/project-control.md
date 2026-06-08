# HomeInStGeorge Project Control

## Active source folder

~/Documents/homeinstgeorge-modern-stack

## Active staging site

https://benlane.us

## Production site

https://homeinstgeorge.com

Do not point production to the Astro/Cloudflare build until Flexmls routing, redirects, SEO, and rollback are verified.

## Architecture

- Astro: public marketing and SEO site
- WordPress: Flexmls IDX runtime
- Flexmls: MLS search, listing details, saved searches, lead capture
- Cloudflare Pages: staging/static deployment
- Cloudflare Workers: later routing/API layer

## Current Flexmls route

/st-george-homes-for-sale/

## IDX rule

Do not scrape, duplicate, or locally store MLS listing data. Route users to the authorized Flexmls runtime.

## Current completed work

- Homepage
- About
- Buyers
- Sellers
- Blog index
- Blog detail route
- Dynamic neighborhood pages
- 31 neighborhood/service-area MDX files
- Seller financing page
- Horse properties page
- Cloudflare Pages staging

## Next work

1. Relocation page copy
2. Neighborhood content upgrades
3. Old-site redirect map
4. /homes/search handoff to /st-george-homes-for-sale/
5. SEO/schema/sitemap/robots
6. Flexmls routing and visual harmonization
7. Lead form backend decision
