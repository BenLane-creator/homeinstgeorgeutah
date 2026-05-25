# Architecture

## Production direction

The site is now a full custom Cloudflare build.

~~~text
Domain: homeinstgeorgeutah.com
Frontend: Astro
Hosting: Cloudflare Pages
Backend/API: Cloudflare Workers
MLS: Washington County BOR - IDX
MLS API: Spark® / RESO Web API
~~~

## Apps

~~~text
apps/site
- Astro frontend
- public content pages
- neighborhood pages
- buyer/seller/relocation pages
- MLS search UI shell

apps/api
- Cloudflare Worker API
- lead capture
- MLS search proxy
- listing detail proxy
- saved search/account features later

apps/app
- future dashboard/admin/client portal
~~~

## Packages

~~~text
packages/config
- site config
- routes
- SEO helpers
- service areas

packages/db
- schema for leads, saved searches, users, listing cache if permitted

packages/ui
- shared UI components
~~~

## Deployment

~~~text
Cloudflare Pages:
- deploy apps/site/dist

Cloudflare Workers:
- deploy apps/api

DNS:
- homeinstgeorgeutah.com -> Cloudflare Pages
- api routes handled by Workers
~~~

## Non-goals

~~~text
No GoDaddy production hosting
No WordPress production dependency
No WordPress Flexmls plugin as the primary IDX layer
No scraping old IDX pages
No copying MLS data outside approved API/display rules
~~~
