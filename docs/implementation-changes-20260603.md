# Implementation changes — 2026-06-03

These changes align the repository with the Revised Master Architecture Spec.

## Added

- Source Layer provider contract with viewer context, consumer context, VOW-aware state, and frontend-safe listing DTOs.
- Spark/RESO provider adapter under `apps/api/src/providers/`.
- Search input parsing and Spark query translation under `apps/api/src/search/`.
- Normalized listing card/detail output instead of raw upstream MLS payload passthrough.
- Provisional compliance/media/disclaimer gate for public IDX vs registered/VOW display handling.
- Project source-of-truth document.
- Revised master architecture spec copied into `docs/`.
- D1 migration for `user_preferences` and `display_rule_snapshots`.

## Changed

- `site.flexmlsSearchUrl` renamed to `site.customSearchUrl`.
- MLS provider copy updated from Washington-only to Washington County MLS + Iron County MLS.
- Public copy now describes the first-party search layer rather than a vendor-hosted Flexmls runtime.
- `/api/v1/search/execute` now returns `listings` DTOs with pagination and warnings.
- `/api/v1/listings/:id` now returns a normalized provisional listing detail DTO.

## Remaining blockers

- Confirm Spark role/access permissions.
- Confirm Washington County MLS and Iron County MLS display rules.
- Confirm VOW availability, consumer-auth requirements, and terms acceptance obligations.
- Confirm caching/storage/refresh/removal rights before persisting raw listing payloads or media.
- Replace Astro public-site package with React + Vite + React Router if the locked stack is enforced immediately rather than at the next rebuild stage.
