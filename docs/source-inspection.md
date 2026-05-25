# Source Inspection — Project Structure and Build/Runtime Notes

Date: 2026-05-24

## Project structure

```txt
homeinstgeorge-modern-stack/
├── apps/
│   ├── site/   Astro public marketing site for HomeInStGeorgeUtah.com
│   ├── api/    Cloudflare Worker API for MLS status/search/listing/lead endpoints
│   └── app/    React Router app zone reserved for dashboard/client/internal tools
├── packages/
│   ├── config/ Shared site, SEO, navigation, and service-area configuration
│   ├── ui/     Shared React UI primitives
│   └── db/     Drizzle schema for future lead/contact/analytics storage
├── docs/       Architecture, deployment, MLS/Flexmls notes, and this inspection
├── scripts/    Route/link audit scripts
├── reports/    Generated audit reports
└── tests/      Playwright e2e smoke tests
```

## Current architecture reading

- `apps/site` is the active public site. It uses Astro with React islands and static output.
- `apps/api` is a separate Cloudflare Worker API. It currently supports health/status/search/listing detail/lead routes.
- `apps/app` is not part of the public website launch path yet. It is a placeholder app zone.
- `packages/config` is the central source for site identity, SEO helpers, navigation, and featured search links.
- `packages/db` is schema-only at this stage; there is no wired database runtime in the app code.

## Build/runtime findings

### 1. Archive includes generated and dependency folders

The archive contains nested `node_modules`, `.wrangler`, and `dist` output. These are generated artifacts, not durable source. They also make diagnostics misleading because the bundled dependency folders appear incomplete under the available Node/npm runtime.

Action taken:

- Expanded `.gitignore` to exclude nested `node_modules`, `dist`, `.astro`, `.wrangler`, `.vite`, `.cache`, `.mf`, test output, and OS/editor files.
- Regenerated `SOURCE_MANIFEST.txt` as a source-focused manifest excluding generated caches, dependencies, disabled backup routes, and before-state files.

### 2. Build tools are Bun-first

Root scripts are Bun-first:

```bash
bun install
bun run dev:site
bun run build:site
```

In the inspection environment, Bun was not installed, so Bun-native validation could not be executed directly. Running npm against the nested archived `node_modules` failed because several transitive packages were missing from the archived dependency folders.

Observed examples under npm/Node:

- `apps/site`: Astro CLI failed before build output because `semver` was missing from archived dependencies.
- `apps/app`: React Router CLI failed because `arg` was missing from archived dependencies.
- `apps/api`: TypeScript CLI failed because `../lib/tsc.js` was missing from archived dependencies.

Interpretation: these are archive/dependency-state failures, not confirmed source-code failures. Fresh dependency install with Bun should be the authoritative validation path.

### 3. Root package metadata cleanup

`package.json` had a duplicate top-level `build:site` key outside `scripts`. JSON permits unknown properties, but this was ambiguous and could confuse maintainers.

Action taken:

- Removed the stray top-level `build:site` property.
- Added a Node engine constraint aligned with current Astro requirements.
- Added package-manager metadata to mark this as a Bun workspace project.

### 4. Featured search URLs had malformed query paths

`packages/config/routes.ts` had featured search URLs in the form:

```txt
/homes/search?maxprice=500000/
/homes/search?keywords=golf/
```

Issues:

- The slash appeared inside the query string rather than before `?`.
- Query keys did not match the API search allowlist (`maxPrice`, `q`, etc.).

Action taken:

- Normalized featured search links to `/homes/search/?maxPrice=500000` and `/homes/search/?q=...`.

### 5. API search parameter handling allowed `NaN`

`apps/api/src/index.ts` converted `limit` and `page` using `Number(...)` without guarding non-numeric input. Bad input could produce `limit=NaN` or `page=NaN` in the upstream MLS request.

Action taken:

- Added `boundedPositiveInt()`.
- Clamped `limit` to 1–50 and `page` to 1–10,000.
- Non-numeric values now fall back safely.

### 6. API upstream errors were returned as successful live responses

The MLS fetch catch block converted an upstream error into a regular object. Because that object was truthy, the endpoint returned `ok: true`, `mode: live`, and a `sparkError` payload with HTTP 200.

Action taken:

- Added `upstreamError()`.
- Search and listing-detail routes now return HTTP 502 with `ok: false` for upstream Spark/RESO failures.
- Stub mode is still returned when MLS credentials are not configured.

### 7. Lead payload contracts were inconsistent

The Astro React island sends:

```txt
intent, name, email, phone, message, pageUrl, consent
```

The standalone Worker lead endpoint previously expected a different shape (`sourcePath`, `listingId`) and did not validate consent.

Action taken:

- Updated `apps/api/src/index.ts` lead handling to accept the Astro island payload.
- Kept backward compatibility with `sourcePath` as a fallback for `pageUrl`.
- Added consent validation.
- Added simple email validation.

### 8. Astro dynamic route frontmatter objects were loosely typed

The blog and neighborhood dynamic routes parsed frontmatter into an untyped object and then indexed it dynamically. Under strict TypeScript settings, this can produce source-check friction.

Action taken:

- Typed parsed frontmatter as `Record<string, string>` in:
  - `apps/site/src/pages/blog/[slug].astro`
  - `apps/site/src/pages/neighborhoods/[slug].astro`
- Added typed `Astro.props` destructuring for those routes.
- Typed `relatedLinksBySlug` as `Record<string, Array<[string, string]>>`.

## Validation performed

### Source structure

Inspected workspace package files, route files, shared config, API Worker source, Astro layout/routes, React Router app routes, scripts, reports, and manifest.

### API TypeScript check

Executed with the available global TypeScript compiler:

```bash
tsc --noEmit -p apps/api/tsconfig.json
```

Result: PASS.

### Audit scripts

Executed:

```bash
bash scripts/audit-site-routes.sh
python3 scripts/audit-neighborhood-links.py
```

Results:

- `audit-neighborhood-links.py`: PASS, no broken generated neighborhood/internal links found.
- `audit-site-routes.sh`: existing `dist` route-file checks passed. Local server checks failed because no dev server was running in this inspection environment.

### Build commands attempted

Attempted npm-based local builds/typechecks due Bun not being available in the inspection environment:

```bash
cd apps/site && npm run build
cd apps/app && npm run build
cd apps/api && npm run typecheck
```

All three failed before meaningful source validation because the archived nested dependency folders were incomplete. Use `bun install` from the repository root, then run the Bun scripts.

## Recommended next validation sequence

From a clean checkout/source folder:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/.wrangler apps/site/dist
bun install
bun run check
bun run build:site
bun --filter @home/api typecheck
bun --filter @home/app build
python3 scripts/audit-neighborhood-links.py
```

## Files changed by this inspection

```txt
.gitignore
SOURCE_MANIFEST.txt
package.json
packages/config/routes.ts
apps/api/src/index.ts
apps/site/src/pages/blog/[slug].astro
apps/site/src/pages/neighborhoods/[slug].astro
docs/source-inspection.md
reports/site-route-audit.txt
reports/neighborhood-link-audit.txt
```

## Follow-up local command failure diagnosis

The command output below means the shell was not inside the extracted monorepo root:

```txt
error: Script not found "check"
error: Script not found "build:site"
error: No packages matched the filter
error: No packages matched the filter
```

The root package in this source tree does define `check` and `build:site`, and the workspace package names are `@home/api` and `@home/app`. Therefore the most likely cause is an extraction/wrapper directory issue, for example running commands from `~/Documents/realtor-site` instead of `~/Documents/realtor-site/homeinstgeorge-modern-stack-inspected-source`.

Added `docs/local-setup-and-validation.md` and `scripts/doctor-local.sh` to make this diagnosis repeatable from the source tree.

## Follow-up after local Bun validation — 2026-05-24

Ben's local run confirmed that the workspace now installs and the Astro site builds successfully. The remaining issues were source/configuration level:

- `bun run check` failed because Biome was checking `.astro` files and reporting false-positive unused imports for Astro components/config values used in templates.
- `@home/api typecheck` failed because `@cloudflare/workers-types` was referenced by `apps/api/tsconfig.json` but not declared in `apps/api/package.json`.
- `@home/app build` failed because React Router could not infer a server runtime from the app package.

Applied fixes:

- Added `@cloudflare/workers-types` to `apps/api` dev dependencies.
- Added `@react-router/node` to `apps/app` dependencies because the current app scripts use React Router's Node-oriented server/serve path.
- Added a root `fix` script for Biome autofixes.
- Excluded `.astro` from Biome checks to avoid false positives; Astro build remains the validation path for `.astro` files.
- Fixed the TypeScript/Biome issues reported in API, app routes, tests, config, and UI helper files.

Recommended validation commands from a clean checkout:

```bash
bun install
bun run fix
bun run check
bun run build:site
bun --filter @home/api typecheck
bun --filter @home/app build
```


## v5 follow-up: final Biome a11y fix

Local validation showed one remaining Biome error in `apps/site/src/components/LeadFormIsland.tsx`: the form submit button needed an explicit `type` attribute. The button is intentionally the form submit control, so it was updated to `type="submit"`.

Observed passing checks from the local run before this final lint fix:

- `bun run build:site` built 44 pages successfully.
- `bun --filter @home/api typecheck` completed successfully.
- `bun --filter @home/app build` completed successfully.
