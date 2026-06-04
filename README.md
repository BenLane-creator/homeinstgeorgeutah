# HomeInStGeorgeUtah Modern Stack

This repository implements the custom **HomeInStGeorgeUtah.com** website, API layer, account foundation, D1-backed lead engine, and Spark/RESO-ready MLS Source Layer.

## Production direction

```text
homeinstgeorgeutah.com             -> Public website on Cloudflare Pages
homeinstgeorgeutah.com/api/*       -> Cloudflare Worker API
www.homeinstgeorgeutah.com/api/*   -> Cloudflare Worker API
Cloudflare D1                      -> Operational source of truth
Cloudflare R2                      -> Assets, exports, guides, and generated files
Spark® / RESO Web API              -> MLS-approved Source Layer access
Washington County MLS              -> MLS scope
Iron County MLS                    -> MLS scope
HubSpot Free                       -> CRM sink only
Cal.com                            -> Booking utility only
```

The website is the product. It is not a wrapper around a vendor search page, hosted IDX site, CRM, booking tool, WordPress install, or Flexmls plugin runtime.

## Current production API status

```text
Worker:
homeinstgeorgeutah-api

Routes:
homeinstgeorgeutah.com/api/*
www.homeinstgeorgeutah.com/api/*

Cloudflare account:
Joel@homeinstgeorge.com's Account

D1 database:
homeinstgeorgeutah

D1 binding:
DB

D1 database ID:
8ca08d07-6614-4533-b7eb-3c92db623282

D1 migrations directory:
../../packages/db/migrations
```

## Architecture rule

The system is divided into four permanent layers.

### Source Layer

The only layer allowed to depend directly on MLS or third-party real estate data vendors.

Responsibilities:

* Spark / RESO Web API integration
* MLS credential and data-plan handling
* Washington + Iron MLS normalization
* provider-specific field mapping
* public IDX display-rights enforcement
* registered-user / VOW display-rights enforcement
* disclaimer and attribution requirements
* photo/media rights enforcement
* caching and refresh policy enforcement
* MLS-status, feed-health, and sync cursors
* consumer-auth bridge to Spark/Flex where required for VOW/authenticated access

### Product Layer

The first-party website and account experience.

Responsibilities:

* homepage
* buyers page
* sellers page
* relocation page
* city pages
* neighborhood pages
* custom search UX
* property pages where permitted
* open house pages
* account pages
* saved homes
* saved searches
* alerts
* inquiry history
* showing request history
* VOW-required gates and terms UX

### Logic Layer

The decision engine.

Responsibilities:

* lead intake normalization
* identity merge / dedupe
* attribution sessions
* workflow lane assignment
* rules-based routing
* AI enrichment and summaries
* booking handoff decisions
* alert eligibility logic
* saved-search execution logic
* favorite-listing logic
* consumer behavior history
* CRM sync orchestration
* conversion analytics
* manual-review logic

### Utility Layer

Downstream service adapters only.

Responsibilities:

* HubSpot Free sync
* Cal.com booking links and booking event handling
* email delivery infrastructure
* SMS delivery infrastructure if added
* analytics export sinks
* R2 file storage

CRM, booking, email, SMS, and analytics may distribute or deliver information, but they do not own identity, routing, saved searches, saved homes, booking decisions, attribution, or workflow state.

## Apps

```text
apps/site  Public website and search shell
apps/api   Cloudflare Worker API, Source Layer, lead engine, and D1 integration
apps/app   React Router dashboard/client/admin zone
```

## Packages

```text
packages/config  Site config, SEO, routes, service-area data, compliance policies
packages/db      D1/SQLite schema and migrations
packages/ui      Shared UI primitives
```

## Run locally

```bash
bun install
cp .env.example .env

bun run dev:site
bun run dev:api
bun run dev:app
```

## Validate locally

```bash
bun run fix
bun run check
bun run build:site

bun --filter @home/api typecheck
bun --filter @home/app build

python3 scripts/audit-neighborhood-links.py
python3 scripts/audit-architecture-drift.py
```

## Cloudflare Worker API

Deploy the API Worker:

```bash
bun --filter @home/api typecheck
bunx wrangler deploy --config apps/api/wrangler.toml
```

Health check:

```bash
curl https://homeinstgeorgeutah.com/api/health
```

Expected result:

```json
{
  "ok": true
}
```

## D1 migrations

The production D1 database is already configured in `apps/api/wrangler.toml`.

Apply remote migrations:

```bash
bunx wrangler d1 migrations apply homeinstgeorgeutah --remote --config apps/api/wrangler.toml
```

Verify remote tables:

```bash
bunx wrangler d1 execute homeinstgeorgeutah --remote --config apps/api/wrangler.toml --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Expected core tables include:

```text
contacts
attribution_sessions
property_context
lead_events
routing_decisions
ai_runs
ai_handoffs
crm_sync_jobs
booking_handoffs
user_accounts
user_auth_sessions
saved_homes
saved_searches
search_subscriptions
property_inquiries
showing_requests
lead_scores
intent_snapshots
listing_cache
listing_media
listing_open_houses
listing_status_history
content_pages
seo_landing_pages
geo_entities
market_reports
audit_logs
compliance_acceptances
provider_sync_cursors
external_identities
user_preferences
display_rule_snapshots
```

## Production API smoke tests

After each Worker deployment, run:

```bash
curl -i https://homeinstgeorgeutah.com/api/health
curl -i https://homeinstgeorgeutah.com/api/v1/search/execute
curl -i https://homeinstgeorgeutah.com/api/v1/search/executee
curl -i https://homeinstgeorgeutah.com/api/v1/listings/test/extra
curl -i https://homeinstgeorgeutah.com/api/v1/reports/market/st-george/extra
```

Expected results:

| Route                                    | Expected                        |
| ---------------------------------------- | ------------------------------- |
| `/api/health`                            | `200`                           |
| `/api/v1/search/execute`                 | `200` while stub mode is active |
| `/api/v1/search/executee`                | `404`                           |
| `/api/v1/listings/test/extra`            | `404`                           |
| `/api/v1/reports/market/st-george/extra` | `404`                           |

The API must not expose raw MLS payloads to the browser.

## Runtime variables

Non-secret production variables live in `apps/api/wrangler.toml`.

Current safe variables:

```toml
APP_ENV = "production"
SITE_URL = "https://homeinstgeorgeutah.com"
MLS_PROVIDER_NAME = "Washington + Iron MLS via approved Spark/Flexmls/FBS access"
SPARK_API_BASE_URL = ""
API_WRITE_ORIGINS = "https://homeinstgeorgeutah.com,https://www.homeinstgeorgeutah.com,https://benlane.us,http://localhost:4321,http://localhost:8787"
```

`SPARK_API_BASE_URL` intentionally remains blank until the approved Spark/FBS endpoint is confirmed.

## Production secrets

Do not commit live credentials, tokens, API keys, MLS credentials, session secrets, or HubSpot tokens.

Use Cloudflare secrets:

```bash
bunx wrangler secret put SPARK_ACCESS_TOKEN --config apps/api/wrangler.toml
bunx wrangler secret put TURNSTILE_SECRET_KEY --config apps/api/wrangler.toml
bunx wrangler secret put SESSION_SECRET --config apps/api/wrangler.toml
bunx wrangler secret put HUBSPOT_ACCESS_TOKEN --config apps/api/wrangler.toml
```

Generate a session secret locally:

```bash
openssl rand -base64 48
```

## Search and MLS mode

Search currently runs in safe stub mode until Spark/FBS credentials, endpoint, access role, field permissions, IDX display rules, VOW requirements, media rights, and caching rules are confirmed.

Stub mode is intentional. It prevents accidental raw MLS payload exposure before compliance gates are finalized.

## Guardrails

* Do not scrape old IDX pages.
* Do not copy MLS photos, remarks, listing fields, listing detail pages, or media outside approved API/display rules.
* Do not expose raw MLS payloads to the browser.
* Do not make a hosted vendor website the product core.
* Do not make CRM the source of truth.
* Do not make booking software the workflow engine.
* Do not let provider quirks leak into product UI.
* Do not store raw MLS listing payloads or media unless caching/storage rights and refresh/removal cadence are confirmed.
* Do not commit secrets.
* Do not bypass the first-party API for high-intent user actions.

## High-intent API-first rule

Every high-intent action must hit the API first:

* request showing
* ask about this property
* save home
* save search
* get similar homes
* seller consultation
* buyer consultation
* relocation help
* home valuation request
* general contact
* book appointment
* subscribe to listing alerts

Required sequence:

```text
validate payload
normalize input
identify or merge contact
attach attribution session
attach property or geo context
classify intent
assign workflow lane
generate AI enrichment when needed
create booking handoff if appropriate
persist full lead event history
sync downstream to HubSpot
update reporting/conversion data
```

No page, embed, CRM form, booking widget, or vendor-owned flow may bypass this sequence.

## Current implementation status

```text
GitHub repo: connected
Cloudflare Worker: deployed
D1 binding: active
D1 migrations: applied
Production health route: passing
Search route: passing in stub mode
Typo routes: returning 404
Spark credentials: pending
Spark endpoint: pending
MLS display rules: pending confirmation
VOW requirements: pending confirmation
```

- Do not make CRM the source of truth.
- Do not make booking software the workflow engine.
- Do not let provider quirks leak into product UI.
