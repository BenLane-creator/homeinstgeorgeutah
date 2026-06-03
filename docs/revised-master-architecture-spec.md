# Revised Master Architecture Spec

## Project

**HomeInStGeorgeUtah.com** is a fully custom Southern Utah real estate website and lead operating system.

This specification supersedes any earlier project language that assumed:

- Washington County only
- WordPress or GoDaddy as part of production architecture
- Flexmls plugin pages as the runtime search layer
- saved searches, saved homes, alerts, or account features being deferred to a later phase
- CRM-owned lead logic
- booking-owned routing logic
- vendor-owned saved-search/account experience as the primary product

This is the new authoritative build direction.

---

## 1. Permanent product definition

The website is **not** a wrapper around a vendor site, plugin, CRM, or scheduler.

The website is the product.

It must own from launch:

- page architecture
- custom search UX
- custom property pages where permitted
- local content system
- local account system
- saved homes
- saved searches
- alert subscriptions
- inquiry history
- showing request history
- attribution sessions
- contact identity
- lead event history
- routing decisions
- AI workflow state
- booking handoff decisions
- CRM sync state
- reporting and conversion logic

External vendors may provide data access, delivery, or synchronization, but they may not become the system core.

---

## 2. Geographic and MLS scope

The source scope for the site is:

- **Washington County MLS**
- **Iron County MLS**

Joel has access to both Washington County and Iron County MLS.

The site must be architected as a **dual-MLS Southern Utah system from the beginning**, not as a Washington-only build that later expands.

Public market reference:

- **SouthernUtahRealEstate.com**

Operational source path:

- **Flexmls / FBS Spark Datamart**
- **Spark API / RESO Web API**
- Approved member-designated access tied to Joel where required
- VOW/authenticated consumer access enabled where approved and required

IDX Broker is **not** the primary plan unless the approved Flexmls/Spark path proves materially insufficient for required product capabilities.

---

## 3. Four-layer architecture rule

The system is divided into four permanent layers.

### 3.1 Source Layer

This is the only layer allowed to depend directly on MLS or third-party real estate data vendors.

Responsibilities:

- Spark / RESO Web API integration
- MLS credential and data-plan handling
- Washington + Iron MLS normalization
- provider-specific field mapping
- public IDX display-rights enforcement
- registered-user / VOW display-rights enforcement
- disclaimer and attribution requirements
- photo/media rights enforcement
- caching and refresh policy enforcement
- MLS-status, feed-health, and sync cursors
- consumer-auth bridge to Spark/Flex where required for VOW/authenticated access

This layer must expose internal provider interfaces, not vendor-specific logic throughout the app.

#### Source Layer contract

```ts
export type ListingProvider = {
  search(input: ListingSearchInput): Promise<ListingSearchResult>
  getById(listingId: string, viewer?: ViewerContext): Promise<Listing | null>
  getMedia(listingId: string, viewer?: ViewerContext): Promise<ListingMedia[]>
  getOpenHouses(listingId: string): Promise<ListingOpenHouse[]>
  getSimilar(input: SimilarListingsInput): Promise<ListingSearchResult>
  getSavedSearches?(input: ConsumerContext): Promise<SavedSearchRecord[]>
  getSavedListings?(input: ConsumerContext): Promise<SavedListingRecord[]>
  sync(input: ListingSyncCursorInput): Promise<ListingSyncResult>
}
```

No other layer may directly depend on Spark/Flexmls quirks.

### 3.2 Product Layer

This layer is the first-party website and account experience.

Responsibilities:

- homepage
- buyers page
- sellers page
- relocation page
- city pages
- neighborhood pages
- search results pages
- map search where allowed
- property pages
- open house pages
- guides/resources pages
- account pages
- saved homes UI
- saved searches UI
- alerts/preferences UI
- inquiry history UI
- showing request history UI
- VOW-required user gates/terms UX
- all CTA logic and forms

This layer must feel like a first-party product, not a vendor embed.

### 3.3 Logic Layer

This layer owns business rules and workflow orchestration.

Responsibilities:

- lead intake normalization
- identity merge / dedupe
- attribution session handling
- workflow lane assignment
- rules-based routing
- AI enrichment and summaries
- booking handoff decisions
- alert eligibility logic
- saved-search execution logic
- favorite-listing logic
- consumer behavior history
- CRM sync orchestration
- conversion analytics
- manual-review logic

This layer is the decision engine.

### 3.4 Utility Layer

This layer contains downstream service adapters.

Responsibilities:

- HubSpot Free sink
- Cal.com booking links and booking event handling
- email delivery infrastructure
- SMS delivery infrastructure if added
- analytics export sinks
- R2 file storage

These utilities may distribute or deliver, but they do not decide.

---

## 4. Locked stack

### Frontend
- React
- Vite
- React Router

### Backend
- Hono
- Cloudflare Workers

### Data / storage
- Cloudflare D1 as the operational source of truth
- Cloudflare R2 for assets, exports, guides, and generated files

### Booking
- Cal.com

### CRM sink
- HubSpot Free only

### DNS / hosting
- Cloudflare DNS
- Cloudflare hosting/runtime

### MLS / data path
- Spark / RESO Web API via approved Flexmls/FBS access
- Washington County MLS + Iron County MLS

### Explicit non-goals
- No GoDaddy production hosting
- No WordPress production dependency
- No Flexmls plugin as the public website runtime
- No CRM as source of truth
- No booking tool as source of truth
- No vendor-owned saved-search system as the core product
- No vendor-owned lead routing as the core decision engine

---

## 5. Product model from launch

This project does **not** defer saved-search and account capabilities to a later phase.

The product model from launch has two operating modes.

### 5.1 Public mode

Anonymous visitors may:

- browse public search results
- view public listing detail permitted under IDX/public display rules
- use local search filters
- inquire on listings
- request showings
- request consultations
- save search criteria locally as anonymous session state until registration

### 5.2 Registered mode

Registered consumers may:

- create local accounts on HomeInStGeorgeUtah.com
- save homes
- save searches
- subscribe to listing alerts
- review inquiry history
- review showing request history
- maintain preferences and notes
- access additional listing detail when permitted after required registration/auth steps
- enter VOW-gated flows where approved and required

### 5.3 Authentication model

The site uses a **linked identity model**.

#### Local application account
The app owns:

- local account record
- identity mapping
- saved homes
- saved searches
- alerts
- inquiries
- showing requests
- preferences
- attribution
- lead history
- workflow state

#### Spark/Flex linked identity
Where VOW or authenticated MLS access requires Spark/Flex consumer authentication, the app links the local user to the external Spark/Flex identity and respects that boundary.

The app does not attempt to replace any required MLS/FBS-authenticated consumer access path.

---

## 6. Core ownership rule

Every high-intent action must hit the API first.

### High-intent actions
- request showing
- ask about this property
- save home
- save search
- get similar homes
- seller consultation
- buyer consultation
- relocation help
- home valuation request
- general contact
- book appointment
- subscribe to listing alerts

### Required sequence
Every such event must pass through this order:

1. validate payload
2. normalize input
3. identify or merge contact
4. attach attribution session
5. attach property or geo context
6. classify intent
7. assign workflow lane
8. generate AI enrichment when needed
9. create booking handoff if appropriate
10. persist full lead event history
11. sync downstream to HubSpot
12. update reporting/conversion data

No page or vendor widget may bypass this flow.

---

## 7. Workflow model

This is a **solo human operation** with **multi-AI workflow handoffs**.

Routing is to workflow lanes, not to multiple human agents.

### Canonical workflow lanes
- `seller_high_priority`
- `valuation`
- `buyer_active_search`
- `buyer_early_stage`
- `relocation`
- `property_inquiry`
- `showing_request`
- `general_contact`
- `booked_consult`
- `nurture`

### AI / service roles
- Intake Agent
- Qualification Agent
- Enrichment Agent
- Routing Agent
- Booking Agent
- CRM Sync Agent
- Follow-up Agent
- Attribution Agent

These are orchestration roles, not human seats.

---

## 8. Canonical data ownership

D1 is the source of truth for all operational state.

### Foundation tables
- contacts
- lead_events
- routing_decisions
- ai_runs
- ai_handoffs
- crm_sync_jobs
- booking_handoffs
- property_context
- attribution_sessions

### Product tables
- user_accounts
- user_auth_sessions
- saved_homes
- saved_searches
- search_subscriptions
- property_inquiries
- showing_requests
- lead_scores
- intent_snapshots
- user_preferences

### Listing tables
- listing_cache (only if permitted and bounded by approved rules)
- listing_media (only if permitted and bounded by approved rules)
- listing_open_houses
- listing_status_history
- provider_sync_cursors

### Content / SEO tables
- content_pages
- seo_landing_pages
- geo_entities
- market_reports

### Governance / compliance tables
- audit_logs
- compliance_acceptances
- external_identities
- display_rule_snapshots

---

## 9. Launch API surface

The website must consume the product through API endpoints, not bypass the API layer.

### Core endpoints
- `/api/v1/leads/intake`
- `/api/v1/valuation/request`
- `/api/v1/properties/inquiry`
- `/api/v1/properties/showing`
- `/api/v1/search/execute`
- `/api/v1/search/map`
- `/api/v1/search/save`
- `/api/v1/homes/save`
- `/api/v1/homes/unsave`
- `/api/v1/alerts/subscribe`
- `/api/v1/auth/register`
- `/api/v1/auth/login`
- `/api/v1/vow/register`
- `/api/v1/vow/accept-terms`
- `/api/v1/bookings/create-handoff`
- `/api/v1/crm/sync`
- `/api/v1/listings/:id`
- `/api/v1/listings/:id/similar`
- `/api/v1/idx/events`
- `/api/v1/reports/market/:geo`

### Launch minimum
Even if some endpoints are initially simple, they must be designed from the beginning to support the full owned system model.

---

## 10. Search and account ownership from launch

The following capabilities are not postponed.

### 10.1 Saved searches
The app owns:

- saved search record
- query definition
- labels/titles
- alert preferences
- execution history
- subscription state
- lead linkage

Spark/Flex data may supplement allowed consumer features, but the product must not rely on vendor-owned saved-search UX as the only implementation.

### 10.2 Saved homes / favorites
The app owns:

- favorited listing references
- timestamps
- folders / labels if added
- removed/archived state
- downstream CRM notes if needed

### 10.3 Alerts
The app owns:

- alert subscription preferences
- search linkage
- delivery settings
- send history
- pause/unsubscribe state
- compliance logging

### 10.4 Consumer history
The app owns:

- inquiry history
- showing request history
- view and interaction history when allowed
- saved search history
- alert history
- lifecycle transitions

---

## 11. MLS compliance and display governance

Compliance logic belongs in the app from the beginning.

### Required controls
- public vs registered-user field visibility
- VOW-gated access handling
- terms acceptance tracking
- audit trails
- disclaimer injection
- data-source attribution
- listing attribution and office/broker display requirements
- photo/media rights handling
- access controls by user state
- caching and refresh enforcement
- sold/off-market handling based on allowed rules
- rate limiting and abuse prevention

### Compliance principle
The app may own the product and lead logic, but it may not exceed approved MLS/FBS display and auth rights.

---

## 12. Page architecture

The public website must include:

- Homepage
- Buyers page
- Sellers page
- Relocation page
- City pages
- Neighborhood pages
- Search results
- Map search if permitted
- Property pages
- Open houses
- Market guides
- Seller resources
- Buyer resources
- Contact page
- Consultation / booking flows

The authenticated layer must include:

- user accounts
- saved homes
- saved searches
- alerts
- inquiry history
- showing request history
- notes/preferences
- compare homes if added
- VOW-gated inventory or fields where legally permitted

Every page must feel first-party.

---

## 13. Page-level conversion model

### Homepage
Primary roles:
- orient
- classify intent
- move visitors into search, consultation, or valuation

### Buyers page
Primary roles:
- active-search lead capture
- search guidance
- saved search conversion
- booking handoff

### Sellers page
Primary roles:
- valuation requests
- seller consultation conversion
- seller prep and process education

### City pages
Primary roles:
- local SEO acquisition
- geo-specific consultation conversion
- search narrowing
- relocation assistance

### Property pages
Primary roles:
- request showing
- ask about property
- save home
- get similar homes
- account creation / login prompts where necessary

All CTAs must use local forms and API-first handling.

---

## 14. CRM rule

HubSpot Free is the **only CRM sink**.

HubSpot does not own:

- identity source of truth
- routing logic
- saved searches
- saved homes
- inquiry history
- attribution
- booking decisions
- AI workflow state

HubSpot receives normalized contacts, notes, tasks, and sync-safe summary data from the app.

---

## 15. Booking rule

Cal.com is the booking utility only.

The app owns:

- whether to present booking
- which booking target to present
- who is eligible for booking handoff
- why booking was triggered
- booking handoff record
- conversion attribution

### Canonical booking targets
- `quick15`
- `buyer30`
- `seller30`
- `relocation45`

Cal.com does not own routing.

---

## 16. Reporting and attribution

The app must own:

- first touch attribution
- last touch attribution
- page-level conversion data
- search-to-inquiry conversion
- property-page conversion
- consultation conversion
- valuation conversion
- saved-search conversion
- saved-home conversion
- booking conversion
- lead-source performance
- city/neighborhood performance

This reporting must be derived from first-party events, not solely CRM activity logs.

---

## 17. Infrastructure posture

### Cloudflare
- DNS at Cloudflare
- frontend runtime on Cloudflare
- API on Cloudflare Workers
- D1 for operational data
- R2 for files/assets/exports

### Domain
- `homeinstgeorgeutah.com` is the production domain

There is no continuing production dependency on GoDaddy or WordPress.

---

## 18. Launch doctrine

This project does **not** use a phased philosophy that defers core ownership.

It launches with the final ownership model in place.

That means:

- dual-MLS architecture from day one
- first-party account model from day one
- first-party saved-search/saved-home logic from day one
- first-party attribution from day one
- first-party routing and AI handoffs from day one
- API-first lead capture from day one
- compliance-aware public vs registered/VOW behavior from day one

Implementation can still be sequenced, but the architecture may not be compromised into a vendor-first interim state.

---

## 19. Permanent exclusions

The following must not become the system core:

- hosted vendor website products
- vendor-owned public search pages as the main UX
- vendor-owned lead forms as the primary capture path
- vendor-owned saved-search logic as the primary user feature
- vendor-owned contact database as the source of truth
- vendor-owned routing automation as the decision engine
- CRM-first product architecture
- booking-first product architecture
- WordPress/Flexmls plugin runtime as the production solution
- Washington-only assumptions in docs, code, or data models
- “saved searches later” assumptions in docs, code, or data models

---

## 20. Current authoritative summary

**HomeInStGeorgeUtah.com** is a custom Southern Utah real estate operating system for a solo operator.

It is built on:

- React + Vite + React Router
- Hono + Cloudflare Workers
- D1 + R2
- Spark / RESO Web API
- Washington County MLS + Iron County MLS
- Cal.com
- HubSpot Free

It owns:

- the public website
- the account system
- saved homes
- saved searches
- alerts
- lead capture
- attribution
- workflow routing
- AI handoffs
- booking handoff decisions
- CRM sync state
- analytics and conversion logic

It uses Flexmls/Spark as the approved MLS data and authenticated-access boundary where required, while preserving first-party ownership of the product and lead system.

That is the master architecture and build language moving forward.
