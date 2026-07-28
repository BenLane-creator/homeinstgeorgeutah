# Production release and rollback

This runbook controls the foundation release for HomeInStGeorgeUtah.com. It does not authorize MLS display, VOW access, indexing, or any change to brokerage/compliance wording.

## Required production environment configuration

The GitHub `production` environment must contain:

- `CLOUDFLARE_API_TOKEN` — least-privilege token with the Pages, Workers, and D1 permissions required by the workflows.
- `CLOUDFLARE_ACCOUNT_ID` — the account that owns the configured D1 database, Worker, Pages project, and zone.
- `BACKUP_ENCRYPTION_PASSPHRASE` — a strong secret used only to encrypt the exported D1 SQL artifact.

The release operator must also know the exact Cloudflare Pages project name. Do not infer it from the domain or Worker name.

## Forward release

Run **Production foundation release** manually and provide:

- `release_sha`: the full lowercase 40-character SHA already merged into `main`;
- `pages_project`: the exact Cloudflare Pages project name;
- `confirmation`: `DEPLOY FOUNDATION`.

The workflow fails closed unless the SHA is the checked-out commit and is contained in `main`.

It then performs this sequence:

1. Re-runs the complete repository release gates.
2. Verifies Cloudflare credentials, account identity, Pages project identity, and pinned Wrangler version.
3. Records the current Worker versions/deployment, Pages production deployments, D1 metadata, migration state, duplicate-email count, and Time Travel bookmark.
4. Exports the full production D1 database.
5. Restores the export into an in-memory SQLite database and requires `integrity_check=ok` plus the required tables.
6. Encrypts the SQL export with AES-256-CBC/PBKDF2 and deletes the plaintext file.
7. Applies all pending D1 migrations.
8. Requires the production migration ledger to exactly match the repository, the unique normalized-email index to exist, and duplicate normalized-email groups to remain zero.
9. Deploys the Worker with the release SHA as both version tag and deployment message.
10. Deploys the built Pages output with the same release SHA as Cloudflare commit metadata.
11. Verifies both active deployment records contain the exact release SHA.
12. Runs production page, redirect, 404, crawl-control, API, MLS-disabled, search-disabled, and lead-origin smoke tests.
13. Uploads an evidence artifact containing the encrypted D1 export, its checksum, Time Travel bookmarks, migration evidence, deployment metadata, and smoke-test output.

The workflow does not activate Washington or Iron County IDX/VOW scopes. The production smoke test requires all four scopes to remain inactive.

## Backup custody

The artifact contains an encrypted production database export and must be treated as confidential operational data.

- Artifact name: `production-release-<release_sha>`
- Retention: 30 days
- The encryption passphrase remains only in the protected GitHub environment.
- Do not paste the passphrase into issues, pull requests, logs, or source files.
- Download and retain the encrypted artifact according to the approved retention procedure when a longer custody period is required.

## Application rollback

Run **Production application rollback** manually and provide:

- `rollback_sha`: a prior full SHA contained in `main`;
- `worker_version_id`: the exact prior Cloudflare Worker version ID from release evidence or Cloudflare deployment history;
- `pages_project`: the exact Pages project name;
- `confirmation`: `ROLLBACK APPLICATION WITHOUT D1 RESTORE`.

The workflow:

1. Builds the Pages site from the exact prior SHA.
2. Captures the current Worker, Pages, and D1 bookmark evidence.
3. Rolls the Worker back to the supplied version ID.
4. Redeploys Pages from the supplied prior SHA.
5. Confirms the requested Worker version and Pages SHA are active.
6. Re-runs the production route and fail-closed smoke tests.
7. Uploads rollback evidence.

The rollback workflow never restores D1. Worker rollback does not undo schema or data changes, and older code may be incompatible with a migrated schema.

## D1 restore decision

D1 Time Travel restore is a separate destructive incident action. It requires explicit incident-owner authorization after the application rollback is evaluated.

Use the `d1-bookmark-before.json` file from the corresponding production release artifact. Verify the database name and bookmark before running any command.

Example operator command:

```bash
bunx wrangler d1 time-travel restore homeinstgeorgeutah \
  --bookmark "<VERIFIED_PRE_RELEASE_BOOKMARK>" \
  --config apps/api/wrangler.toml
```

A restore overwrites the production database in place and cancels in-flight queries. Record the bookmark returned by the restore so the restore itself can be reversed if necessary.

## Launch-state restrictions

A successful foundation release is not launch approval. Keep these controls unchanged until the broker and technical owner record a separate go decision:

- `PUBLIC_PRELAUNCH=true`;
- `noindex,nofollow` metadata;
- crawler-wide robots block;
- Washington IDX disabled;
- Washington VOW disabled;
- Iron IDX disabled;
- Iron VOW disabled;
- listing-detail, sold-data, and VOW-restricted display disabled.
