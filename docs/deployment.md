# Deployment Plan

## Release doctrine

Production changes are made only from an immutable SHA already contained in `main`.

The manual release workflow is authoritative for the approved production release. A Git-connected Cloudflare Pages source must not independently overwrite that release; verify or disable automatic production deployment before proceeding.

A foundation deployment keeps indexing and all Washington/Iron IDX/VOW scopes disabled. Live MLS activation is a separate approved change.

## 1. Qualify the release SHA

1. Merge reviewed repository changes to `main`.
2. Record the full 40-character SHA.
3. Require Release QA to pass on that exact SHA.
4. Resolve all actionable review threads.
5. Confirm `docs/operations/prelaunch-go-no-go.md` accurately reflects the intended release state.

## 2. Run read-only production preflight

Dispatch `.github/workflows/production-preflight.yml` and require it to verify:

- Cloudflare account identity
- Committed D1 database name and UUID
- Complete remote migration ledger
- Contact-email integrity
- Existing Worker deployment and approved secret-name inventory
- Root-domain API routing
- Anonymous consumer session state
- All four IDX/VOW scopes inactive

The preflight performs no D1 write, deployment, secret change, route change, account creation, or MLS activation.

## 3. Configure required production utilities

Before lead operations are approved:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `BACKUP_ENCRYPTION_PASSPHRASE`
- `INTERNAL_JOB_TOKEN`
- `TURNSTILE_SECRET_KEY`
- approved `EMAIL_DELIVERY_WEBHOOK_URL`
- `EMAIL_DELIVERY_TOKEN` when required by the delivery utility

Do not configure MLS credentials or enable flags until the corresponding authorization and policy contract is approved.

## 4. Dispatch the foundation release

Use `.github/workflows/production-release.yml` with:

- the approved immutable SHA;
- the exact existing Pages project name;
- Worker bootstrap approval only when Cloudflare confirms the Worker does not exist;
- the exact confirmation phrase.

The workflow must complete in this order:

1. full release gates;
2. Cloudflare account/project/secret validation;
3. D1 identity and integrity evidence;
4. encrypted D1 backup and local restore drill;
5. remote migration apply and ledger verification;
6. fail-closed bootstrap Worker when required;
7. Worker and Pages deploy from the same SHA;
8. deployment metadata verification;
9. production route and disabled-MLS smoke tests;
10. encrypted evidence upload.

## 5. Controlled lead verification

After deployment, submit one approved test lead through the real production form with valid consent and Turnstile.

Verify exactly one:

- contact;
- attribution session;
- property context;
- lead event;
- routing decision;
- intake/idempotency record;
- notification outbox record;
- delivered owner notification.

Reuse the same submission identifier and confirm no duplicate records or notifications are created.

## 6. Rollback readiness

Record the prior Pages SHA, prior Worker version, D1 Time Travel bookmark, encrypted backup hash, operator, and UTC timestamps.

Use `.github/workflows/production-rollback.yml` for application rollback. It must not automatically restore D1. D1 restoration requires a separate incident decision and approved procedure.

## 7. Final launch and MLS activation

Do not enable indexing or any IDX/VOW scope during the foundation release.

Final launch additionally requires:

- executed Washington and Iron authorization;
- exact policy versions and provider configuration;
- approved credentials in Worker secrets;
- encoded display/media/attribution/cache rules;
- controlled county-specific tests;
- first-party property/account capabilities required by the Final Website Project;
- broker/legal and technical-owner signoff;
- a separate indexing release that changes both metadata and `robots.txt` deliberately.
