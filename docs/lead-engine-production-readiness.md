# Lead Engine Production Readiness

## Current status

The D1 lead-intake foundation is merged to `main`.

Implemented:

- `POST /api/v1/leads/intake`
- Legacy `POST /api/leads` compatibility route
- D1-backed contact upsert
- D1-backed attribution session
- D1-backed property context
- D1-backed lead event
- D1-backed routing decision
- Routing classification tests
- Local D1 smoke script

## Verified locally

Validation passed:

- `bun run check`
- `bun --filter @home/api test`
- `bun --filter @home/api typecheck`
- `bun run build:site`
- `bun run audit:architecture`
- `python3 scripts/audit-neighborhood-links.py`
- `./scripts/smoke-lead-intake-local.sh`

Local smoke test confirmed:

- Missing consent returns `400`
- Bad email returns `400`
- Missing name returns `400`
- Valid lead returns `201`
- Explicit `general_contact` remains `general_contact`
- Duplicate email produces one contact record and multiple lead events

## Remote D1 status

Read-only migration check reported no pending migrations.

Do not apply remote migrations unless explicitly authorized.

Before remote production enablement:

1. Confirm Cloudflare D1 database target is correct.
2. Back up/export production D1 if it contains existing data.
3. Confirm migrations are already applied or apply them during a controlled window.
4. Run production `/api/health` and `/api/mls-status`.
5. Submit one controlled test lead only after D1 schema is confirmed.
6. Verify `contacts`, `lead_events`, `attribution_sessions`, `property_context`, and `routing_decisions`.
7. Remove test lead data if required.

## Production write-response requirements

Lead/write responses should:

- Use origin-aware CORS from `API_WRITE_ORIGINS`
- Avoid wildcard write-origin responses
- Return `Cache-Control: no-store`
- Preserve legacy `/api/leads` only until frontend callers are migrated
- Prefer `/api/v1/leads/intake`

## Not yet complete

Still needed before live production lead routing:

- Turnstile server-side verification
- Rate limiting / abuse protection
- CRM sync job processing
- Booking handoff eligibility
- Email/SMS delivery handoff
- Production test-data cleanup process
