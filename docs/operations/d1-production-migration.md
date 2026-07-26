# Production D1 Migration and Worker Deployment Gate

This is a mandatory stop/go procedure for production D1 schema changes that must land before a Worker release. Repository repair and CI runs must not execute any command in this document against production.

## Preconditions

- The broker and technical owner have approved one immutable release SHA.
- Release QA is green for that SHA, including `scripts/test-d1-migrations.sh`.
- The production D1 binding and database name have been independently verified.
- The D1 export/restore drill and Worker rollback procedure are current.
- The operator has an approved secure backup destination outside the repository.
- Production MLS activation flags remain unchanged unless separately approved.

Set the release identifier for the change record:

```bash
RELEASE_SHA="replace-with-approved-immutable-sha"
```

Stop if the checkout is not clean and exactly at that SHA:

```bash
test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
test -z "$(git status --short)"
```

## 1. Back up production D1

Export the remote database to the approved secure destination and record the file hash, UTC timestamp, D1 Time Travel point, operator, and release SHA in the change record.

```bash
D1_BACKUP_PATH="/approved/secure/location/homeinstgeorgeutah-pre-migration.sql"

bunx wrangler d1 export homeinstgeorgeutah \
  --remote \
  --output "$D1_BACKUP_PATH" \
  --config apps/api/wrangler.toml

sha256sum "$D1_BACKUP_PATH"
```

Stop unless the export exists, is non-empty, is stored outside the repository, and the restore point has been recorded.

## 2. Run the duplicate-email preflight

```bash
bunx wrangler d1 execute homeinstgeorgeutah \
  --remote \
  --config apps/api/wrangler.toml \
  --command "
    select email_normalized, count(*) as duplicate_count
    from contacts
    group by email_normalized
    having count(*) > 1
    order by duplicate_count desc, email_normalized;
  "
```

Expected result: zero rows. Any duplicate is a hard stop. Do not apply `0002_contact_integrity.sql` until the records have been reviewed and remediated under an approved data-change plan.

## 3. List and apply remote migrations

List the versioned migration state before applying anything:

```bash
bunx wrangler d1 migrations list homeinstgeorgeutah \
  --remote \
  --config apps/api/wrangler.toml
```

Confirm that the pending list matches the approved release change record, then apply through Wrangler's migration ledger:

```bash
bunx wrangler d1 migrations apply homeinstgeorgeutah \
  --remote \
  --config apps/api/wrangler.toml
```

Do not use `d1 execute --file` to apply versioned migrations.

## 4. Verify 0002 and the unique index

Re-list migrations and query both Wrangler's ledger and SQLite's index metadata:

```bash
bunx wrangler d1 migrations list homeinstgeorgeutah \
  --remote \
  --config apps/api/wrangler.toml

bunx wrangler d1 execute homeinstgeorgeutah \
  --remote \
  --config apps/api/wrangler.toml \
  --command "
    select name, applied_at
    from d1_migrations
    where name = '0002_contact_integrity.sql';

    select name, \"unique\"
    from pragma_index_list('contacts')
    where name = 'contacts_email_normalized_unique_idx';
  "
```

Proceed only when `0002_contact_integrity.sql` is recorded as applied and `contacts_email_normalized_unique_idx` exists with `unique = 1`. Record the output in the change evidence.

## 5. Deploy the Worker

Only after the migration verification passes:

```bash
bunx wrangler deploy --config apps/api/wrangler.toml
```

Record the deployed Worker version and confirm it corresponds to `RELEASE_SHA`. Do not change DNS, Pages, D1 data, Turnstile, or MLS activation as part of this step unless separately approved.

## 6. Run one controlled lead smoke test

1. From the production origin, submit one approved test lead through the real form with a unique controlled email address, valid consent, and a valid Turnstile response.
2. Confirm the browser receives the normal success state and no technical details are exposed.
3. Query D1 by the normalized test email and verify exactly one contact, one lead event, one routing decision, one intake/idempotency record, and one owner-notification outbox row.
4. Confirm exactly one approved owner notification is delivered; record the outbox status and provider message identifier.
5. Reuse of the same submission identifier must return the stored result without creating another record or notification.
6. Remove or retain the controlled record only under the approved test-data retention procedure.

Any mismatch is a failed production gate. Stop further release activity, preserve logs and D1 evidence, and follow the incident and rollback procedures.
