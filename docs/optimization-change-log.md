# Optimization Change Log

Date: 2026-05-28

## Backup

A backup ZIP was created before changes:

```text
homeinstgeorge-modern-stack-backup-before-optimizations-20260528.zip
```

## Changes applied

- Updated project control and deployment docs to remove active WordPress/Flexmls-handoff drift.
- Added D1-first foundation migration for contacts, lead events, attribution, routing, saved homes/searches, listing cache, content/SEO, and governance tables.
- Replaced the previous Postgres-shaped Drizzle schema with D1/SQLite-shaped Drizzle tables.
- Added API-first lead intake aliases for `/api/v1/leads/intake`, valuation, property inquiry, and showing requests.
- Removed the old Cloudflare Pages `/api/leads` function so lead intake does not bypass the Worker/D1 source of truth.
- Added lead payload normalization, consent validation, email validation, workflow lane classification, D1 persistence, and KV fallback.
- Added attribution and device context capture from the React lead form.
- Added a mobile sticky action bar for Call/Search/Ask.
- Upgraded `/homes/search/` from a placeholder to a first-party search shell with filters and high-intent CTAs.
- Corrected featured search query URLs to match the API allowlist.
- Updated robots.txt to use `homeinstgeorgeutah.com`.
- Added cache/security headers for static assets and SEO files.
- Added compliance display-policy scaffolding and a Source Layer listing provider contract.
- Added architecture drift audit script.
- Added Bun workspace cleanup from previous source-inspection fixes: `fix` script, worker types, React Router Node runtime, and Biome Astro exclusion.

## Not changed

- No live Cloudflare deployment was performed.
- No DNS changes were made.
- No MLS credentials were added.
- No vendor account settings were changed.
- No production database was modified.
