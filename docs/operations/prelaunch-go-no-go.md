# Prelaunch Go/No-Go Record

Release state: **NO-GO until every applicable external and production verification item is complete.**

## Repository and build

- [ ] Release candidate records one immutable SHA from `main`.
- [ ] No unresolved actionable review threads.
- [ ] Frozen install, lint, typecheck, unit/integration, Astro build, Playwright, accessibility, dependency audit, and Wrangler dry-run pass on that SHA.
- [ ] Preview smoke test passes on the exact release SHA.

## Brand, content, and compliance

- [x] Headline is `Better Real Estate Decisions.`
- [x] Featured areas are Winchester Hills, Dammeron Valley, Sunbrook, and Ivins.
- [x] Canonical domain references use `homeinstgeorgeutah.com`.
- [ ] Brokerage identity and license wording are broker-confirmed.
- [ ] Material local claims have approved sources or broker-interpretation labels.
- [ ] Privacy, terms, consent, accessibility, and retention language are approved.

## Cloudflare and data

- [ ] Pages custom domain and deployment source verified.
- [ ] `www` redirects once to apex.
- [ ] `/api/*` reaches the Worker and never Pages fallback.
- [ ] Preview and production configuration/data are separated.
- [ ] D1 binding and all migrations verified.
- [ ] D1 export and restore drill succeeds.
- [ ] Turnstile client/server verification succeeds.
- [ ] Allowed origins, rate controls, body limits, and approved secret names verified in production.
- [ ] No secret values appear in logs or source.

## Forms and operations

- [x] Forms map to server-controlled canonical workflow lanes.
- [x] Idempotency prevents retry duplication.
- [x] Contact, event, routing decision, intake record, and notification job use one D1 batch.
- [x] Repeated submissions preserve existing phone values.
- [x] Notification failure is recoverable from the D1 outbox.
- [x] Buyer forms cannot automate delivery to `buyers@homeinstgeorgeutah.com`.
- [x] Retention/export/deletion ownership is documented.
- [x] Incident ownership and response procedure are documented.
- [ ] Controlled production submission creates exactly one canonical record set.
- [ ] Exactly one approved owner notification is delivered and evidenced.

## MLS

- [ ] Washington County IDX authorization and production access are on file.
- [ ] Washington County VOW authorization and credentials are on file.
- [ ] Iron County IDX authorization and production access are on file.
- [ ] Iron County VOW authorization and credentials are on file.
- [x] Four scopes are independently gated and default disabled.
- [x] Visitor search reads only the owned canonical cache.
- [x] Source synchronization skips inactive scopes without provider access.
- [ ] Field/media/attribution/refresh/cache rules are encoded from executed terms.
- [ ] County-specific sync, attribution, cache, and kill-switch tests pass with approved data.
- [x] Public mock, scraped listings, listing details, sold data, and unapproved VOW fields remain disabled.

## SEO, accessibility, and performance

- [x] Prelaunch pages use `noindex,nofollow`.
- [ ] Launch indexing receives separate explicit approval.
- [x] Canonical, sitemap, true 404, responsive-width, keyboard, label, and core accessibility checks exist in CI.
- [ ] Production robots, sitemap, favicon, Open Graph bytes/MIME, and performance budgets are verified.

## Production and rollback

- [ ] Production Pages and Worker versions match the approved SHA.
- [ ] Prior Pages and Worker versions remain available.
- [ ] D1 backup/Time Travel point recorded before migration.
- [ ] Health, logs, analytics, and error alerts are visible.
- [ ] Post-deployment page/API/form smoke test passes.
- [ ] Rollback procedure has been rehearsed.
- [ ] Final go/no-go is signed by Joel Robertson and the technical owner.

## MLS-unavailable launch rule

If any required MLS authorization remains unresolved, the foundation may launch only with live IDX/VOW data disabled and the home-search route displaying the honest unavailable/contact state. No mock, scraped, or unapproved listing data may be substituted.
