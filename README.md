# HomeInStGeorgeUtah.com

Custom real estate website, lead engine, and MLS-ready platform for Joel Robertson, a St. George, Utah broker/Realtor with 20+ years of experience.

## Production domain

HomeInStGeorgeUtah.com

The older homeinstgeorge.com domain is still live but is unrelated to this project. Do not use it for production deployment, canonical URLs, Cloudflare routing, MLS/API configuration, redirect planning, or launch assumptions for this repository.

## Architecture direction

This project is a custom Cloudflare-first real estate platform.

- Frontend: React, Vite, React Router
- API: Hono on Cloudflare Workers
- Database: Cloudflare D1
- Storage: Cloudflare R2
- MLS data: FBS / Spark / RESO Web API through provider adapters
- Deployment: Cloudflare Pages and Workers

The website is the primary product. It is not a wrapper around a vendor website, hosted IDX theme, CRM workflow, booking tool, or WordPress plugin.

## Permanent layers

1. Source Layer: MLS-approved listing data access, RESO-shaped provider adapters, compliance rules, display rights, attribution, and media permissions.
2. Product Layer: public website, search UX, property pages, user accounts, saved homes, saved searches, alerts, city pages, neighborhood pages, and lead forms.
3. Logic Layer: lead intake, contact identity, dedupe, attribution, routing, workflow assignment, AI enrichment, booking handoffs, CRM sync orchestration, reporting, and conversion data.
4. Utility Layer: CRM sync, booking utility, email delivery, SMS delivery, analytics exports, and file storage.

Only the Source Layer may depend on external real estate data vendors.

## Apps

- apps/site: current public website and content seed
- apps/api: Cloudflare Worker API
- apps/app: React Router app zone for dashboard, portal, saved homes, saved searches, internal tools, and authenticated workflows

## Packages

- packages/config: shared site config, SEO helpers, navigation, and route configuration
- packages/ui: shared UI primitives and reusable components
- packages/db: database schema and helpers

Cloudflare D1 is the operational source of truth.

## Core API direction

- POST /api/v1/leads/intake
- POST /api/v1/valuation/request
- POST /api/v1/properties/inquiry
- POST /api/v1/properties/showing
- POST /api/v1/search/execute
- POST /api/v1/search/map
- POST /api/v1/search/save
- POST /api/v1/homes/save
- POST /api/v1/homes/unsave
- POST /api/v1/alerts/subscribe
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/vow/register
- POST /api/v1/vow/accept-terms
- POST /api/v1/bookings/create-handoff
- POST /api/v1/crm/sync
- POST /api/v1/listings/reindex
- GET /api/v1/listings/:id
- GET /api/v1/reports/market/:geo

## Lead routing lanes

- seller_high_priority
- valuation
- buyer_active_search
- buyer_early_stage
- relocation
- property_inquiry
- showing_request
- general_contact
- booked_consult
- nurture

## Non-goals

- No production dependency on homeinstgeorge.com
- No GoDaddy production hosting
- No WordPress production dependency
- No WordPress/Flexmls plugin as the product core
- No hosted vendor website as the primary UX
- No vendor-owned lead forms
- No vendor-owned saved-search logic
- No CRM as source of truth
- No booking tool as workflow owner
- No scraping or copying MLS data outside approved MLS/API rules

## Local validation

Run from the repository root:

- bun install
- bun run fix
- bun run check
- bun run build:site
- bun --filter @home/api typecheck
- bun --filter @home/app build

## Current status

Phase 1 source consolidation is complete.

Next phase: Phase 2 — Owned lead engine foundation.
