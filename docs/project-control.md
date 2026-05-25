# HomeInStGeorgeUtah.com Project Control

## Active source folder

~/Documents/realtor-site

## Production domain

https://HomeInStGeorgeUtah.com

## Important domain note

https://homeinstgeorge.com is still live but is unrelated to this project.

Do not use homeinstgeorge.com for production deployment, redirects, Cloudflare Pages routing, MLS/API configuration, SEO canonical URLs, sitemap URLs, or launch assumptions for this project.

## Current production direction

The project is a custom Cloudflare-first real estate website and lead engine for Joel Robertson in St. George, Utah.

Core direction:

- Custom public website
- Custom search and property experience
- Owned lead intake and routing logic
- Cloudflare Pages / Workers deployment
- D1 as operational source of truth
- R2 for assets and generated files
- MLS/FBS/Spark/RESO access only through provider adapters
- CRM, booking, email, SMS, and analytics as downstream utilities only

## Architecture rule

The system is divided into four layers:

1. Source Layer
2. Product Layer
3. Logic Layer
4. Utility Layer

Only the Source Layer may depend on external real estate data vendors.

## Non-goals

- No production dependency on homeinstgeorge.com
- No GoDaddy production hosting
- No WordPress/Flexmls plugin as the product core
- No vendor-owned search UX as the main experience
- No vendor-owned lead forms
- No CRM as source of truth
- No booking tool as workflow owner
- No scraping or copying MLS data outside approved MLS/API rules
