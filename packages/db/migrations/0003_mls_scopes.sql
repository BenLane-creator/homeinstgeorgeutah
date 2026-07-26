PRAGMA foreign_keys = ON;

create table if not exists mls_authorization_scopes (
  scope_key text primary key check (
    scope_key in ('washington-idx','washington-vow','iron-idx','iron-vow')
  ),
  county_key text not null check (county_key in ('washington','iron')),
  role_key text not null check (role_key in ('idx','vow')),
  approval_status text not null default 'not-requested' check (
    approval_status in ('not-requested','pending','approved','denied','suspended')
  ),
  provider text,
  feed_id text,
  policy_version text,
  terms_accepted_at text,
  approval_requested_at text,
  approved_at text,
  activated_at text,
  disabled_at text,
  disabled_reason text,
  metadata_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);

insert or ignore into mls_authorization_scopes (
  scope_key,
  county_key,
  role_key,
  approval_status
) values
  ('washington-idx', 'washington', 'idx', 'pending'),
  ('washington-vow', 'washington', 'vow', 'pending'),
  ('iron-idx', 'iron', 'idx', 'pending'),
  ('iron-vow', 'iron', 'vow', 'pending');

create table if not exists mls_sync_cursors (
  id text primary key,
  scope_key text not null references mls_authorization_scopes(scope_key),
  resource_name text not null,
  cursor_value text,
  last_attempt_at text,
  last_success_at text,
  last_error text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP,
  unique(scope_key, resource_name)
);
create index if not exists mls_sync_cursors_scope_idx
  on mls_sync_cursors(scope_key);

create table if not exists listing_scope_membership (
  listing_id text not null references listing_cache(id),
  scope_key text not null references mls_authorization_scopes(scope_key),
  source_listing_key text not null,
  first_seen_at text not null default CURRENT_TIMESTAMP,
  last_seen_at text not null default CURRENT_TIMESTAMP,
  primary key (listing_id, scope_key),
  unique(scope_key, source_listing_key)
);
create index if not exists listing_scope_membership_scope_idx
  on listing_scope_membership(scope_key);

create table if not exists vow_authorization_attempts (
  id text primary key,
  scope_key text not null references mls_authorization_scopes(scope_key),
  user_account_id text references user_accounts(id),
  state_hash text not null,
  nonce_hash text,
  redirect_after text,
  status text not null default 'started' check (
    status in ('started','completed','rejected','expired','failed')
  ),
  expires_at text not null,
  completed_at text,
  error_code text,
  created_at text not null default CURRENT_TIMESTAMP
);
create index if not exists vow_authorization_attempts_state_idx
  on vow_authorization_attempts(state_hash);
create index if not exists vow_authorization_attempts_user_idx
  on vow_authorization_attempts(user_account_id);
