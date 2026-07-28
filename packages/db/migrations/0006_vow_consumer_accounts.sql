PRAGMA foreign_keys = ON;

alter table vow_authorization_attempts add column claimed_at text;

create unique index if not exists vow_authorization_attempts_state_unique_idx
  on vow_authorization_attempts(state_hash);

create unique index if not exists user_accounts_email_normalized_unique_idx
  on user_accounts(email_normalized);

create unique index if not exists user_auth_sessions_hash_unique_idx
  on user_auth_sessions(session_hash);

create unique index if not exists external_identities_provider_external_unique_idx
  on external_identities(provider, external_id);

create unique index if not exists saved_homes_user_listing_unique_idx
  on saved_homes(user_account_id, listing_id);

create table if not exists vow_access_grants (
  id text primary key,
  user_account_id text not null references user_accounts(id) on delete cascade,
  scope_key text not null references mls_authorization_scopes(scope_key),
  provider_contact_id text not null,
  status text not null default 'active' check (status in ('active','expired','revoked')),
  authenticated_at text not null default CURRENT_TIMESTAMP,
  expires_at text,
  last_seen_at text not null default CURRENT_TIMESTAMP,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP,
  unique(user_account_id, scope_key),
  unique(scope_key, provider_contact_id)
);
create index if not exists vow_access_grants_user_idx
  on vow_access_grants(user_account_id, status);
create index if not exists vow_access_grants_scope_idx
  on vow_access_grants(scope_key, status);

create table if not exists vow_oauth_tokens (
  grant_id text primary key references vow_access_grants(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_type text not null default 'OAuth',
  access_expires_at text,
  refresh_expires_at text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);

create table if not exists consumer_audit_events (
  id text primary key,
  user_account_id text references user_accounts(id) on delete set null,
  event_type text not null check (
    event_type in ('vow_login','vow_logout','saved_home_created','saved_home_deleted','saved_search_created','saved_search_deleted')
  ),
  scope_key text references mls_authorization_scopes(scope_key),
  entity_id text,
  payload_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP
);
create index if not exists consumer_audit_events_user_idx
  on consumer_audit_events(user_account_id, created_at);
