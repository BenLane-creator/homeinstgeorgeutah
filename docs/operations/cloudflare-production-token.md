# Production Cloudflare API token

The GitHub `production` environment secret `CLOUDFLARE_API_TOKEN` must be a Cloudflare API token scoped to the production account and the `homeinstgeorgeutah.com` zone.

Required permissions:

- Account — Account Settings — Read
- Account — Workers Scripts — Edit
- Account — D1 — Edit
- Account — Cloudflare Pages — Edit
- Zone — Workers Routes — Edit, limited to `homeinstgeorgeutah.com`

These permissions are required by the guarded production workflows for Worker deployment/version metadata, Worker deploy/rollback, D1 read/export/migration operations, Pages project/deployment operations, and Worker route management.

Do not commit or paste the token into repository files, issues, pull requests, logs, or chat. Store it only as the GitHub `production` environment secret named `CLOUDFLARE_API_TOKEN`.

After replacement, rerun **Production read-only preflight**. Do not dispatch **Production foundation release** until preflight passes.
