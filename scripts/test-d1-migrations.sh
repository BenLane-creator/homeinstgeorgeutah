#!/usr/bin/env bash
set -euo pipefail

config_path="apps/api/wrangler.toml"
database_name="homeinstgeorgeutah"
state_dir="$(mktemp -d)"
migration_files=(packages/db/migrations/*.sql)
expected_migration_count="${#migration_files[@]}"

cleanup() {
  rm -rf -- "$state_dir"
}
trap cleanup EXIT

bunx wrangler d1 migrations list "$database_name" \
  --local \
  --persist-to "$state_dir" \
  --config "$config_path"

bunx wrangler d1 migrations apply "$database_name" \
  --local \
  --persist-to "$state_dir" \
  --config "$config_path"

bunx wrangler d1 migrations list "$database_name" \
  --local \
  --persist-to "$state_dir" \
  --config "$config_path"

upsert_sql="
insert into contacts
  (id, full_name, first_name, last_name, email, email_normalized, phone,
   phone_normalized, source)
values
  ('migration-contact-1', 'Initial Lead', 'Initial', 'Lead',
   'Migration@Test.Example', 'migration@test.example', '(435) 555-0100',
   '4355550100', 'website')
on conflict(email_normalized) do update set
  full_name = case when excluded.full_name <> '' then excluded.full_name else contacts.full_name end,
  first_name = case when excluded.first_name <> '' then excluded.first_name else contacts.first_name end,
  last_name = case when excluded.last_name <> '' then excluded.last_name else contacts.last_name end,
  email = case when excluded.email <> '' then excluded.email else contacts.email end,
  phone = coalesce(excluded.phone, contacts.phone),
  phone_normalized = coalesce(excluded.phone_normalized, contacts.phone_normalized),
  updated_at = CURRENT_TIMESTAMP;

insert into contacts
  (id, full_name, first_name, last_name, email, email_normalized, phone,
   phone_normalized, source)
values
  ('migration-contact-2', 'Updated Lead', 'Updated', 'Lead',
   'migration@test.example', 'migration@test.example', null, null, 'website')
on conflict(email_normalized) do update set
  full_name = case when excluded.full_name <> '' then excluded.full_name else contacts.full_name end,
  first_name = case when excluded.first_name <> '' then excluded.first_name else contacts.first_name end,
  last_name = case when excluded.last_name <> '' then excluded.last_name else contacts.last_name end,
  email = case when excluded.email <> '' then excluded.email else contacts.email end,
  phone = coalesce(excluded.phone, contacts.phone),
  phone_normalized = coalesce(excluded.phone_normalized, contacts.phone_normalized),
  updated_at = CURRENT_TIMESTAMP;

insert into user_accounts
  (id, email, email_normalized, status)
values
  ('migration-vow-user', 'vow-session@test.example', 'vow-session@test.example', 'active');

insert into vow_access_grants
  (id, user_account_id, scope_key, provider_contact_id, status, expires_at)
values
  ('migration-vow-grant', 'migration-vow-user', 'washington-vow',
   'migration-provider-contact', 'active', '2030-01-01T00:00:00.000Z');

insert into user_auth_sessions
  (id, user_account_id, session_hash, expires_at)
values
  ('migration-vow-session', 'migration-vow-user', 'migration-session-hash',
   '2030-02-01T00:00:00.000Z');

update vow_access_grants
set expires_at = '2029-12-01T00:00:00.000Z',
    updated_at = CURRENT_TIMESTAMP
where id = 'migration-vow-grant';
"

bunx wrangler d1 execute "$database_name" \
  --local \
  --persist-to "$state_dir" \
  --config "$config_path" \
  --command "$upsert_sql"

verification_sql="
select
  (select count(*) from d1_migrations) as applied_migration_count,
  (select count(*) from pragma_index_list('contacts')
    where name = 'contacts_email_normalized_unique_idx' and \"unique\" = 1)
    as unique_index_count,
  (select count(*) from contacts
    where email_normalized = 'migration@test.example') as contact_count,
  (select id from contacts
    where email_normalized = 'migration@test.example') as contact_id,
  (select full_name from contacts
    where email_normalized = 'migration@test.example') as full_name,
  (select phone_normalized from contacts
    where email_normalized = 'migration@test.example') as phone_normalized,
  (select count(*) from sqlite_master
    where type = 'trigger'
      and name = 'user_auth_sessions_bound_to_vow_grants_after_insert')
    as vow_session_trigger_count,
  (select expires_at from user_auth_sessions
    where id = 'migration-vow-session') as vow_session_expires_at;
"

verification_json="$(
  bunx wrangler d1 execute "$database_name" \
    --local \
    --persist-to "$state_dir" \
    --config "$config_path" \
    --command "$verification_sql" \
    --json
)"

EXPECTED_MIGRATION_COUNT="$expected_migration_count" \
VERIFICATION_JSON="$verification_json" \
bun -e '
const payload = JSON.parse(process.env.VERIFICATION_JSON || "[]");
const row = payload.flatMap((entry) => entry.results || [])[0];
const expectedMigrationCount = Number(process.env.EXPECTED_MIGRATION_COUNT);

if (
  !row ||
  Number(row.applied_migration_count) !== expectedMigrationCount ||
  Number(row.unique_index_count) !== 1 ||
  Number(row.contact_count) !== 1 ||
  row.contact_id !== "migration-contact-1" ||
  row.full_name !== "Updated Lead" ||
  row.phone_normalized !== "4355550100" ||
  Number(row.vow_session_trigger_count) !== 1 ||
  row.vow_session_expires_at !== "2029-12-01 00:00:00"
) {
  console.error("D1 migration/upsert/session-expiry verification failed.", {
    expectedMigrationCount,
    row,
  });
  process.exit(1);
}

console.log(
  `D1 migration test passed: ${expectedMigrationCount} migrations applied; unique email upsert and VOW session expiry verified.`,
);
'