PRAGMA foreign_keys = ON;

-- The site is preproduction. Review any unexpected duplicate account rows before
-- applying this migration to a non-empty environment.
create unique index if not exists user_accounts_email_normalized_unique_idx
  on user_accounts(email_normalized);
create unique index if not exists user_auth_sessions_hash_unique_idx
  on user_auth_sessions(session_hash);
create unique index if not exists external_identities_provider_subject_unique_idx
  on external_identities(provider, external_id);
create unique index if not exists saved_homes_user_listing_unique_idx
  on saved_homes(user_account_id, listing_id);

alter table user_auth_sessions add column last_seen_at text;
alter table user_auth_sessions add column revoked_at text;
alter table user_auth_sessions add column user_agent text;
alter table user_auth_sessions add column ip_address text;

alter table saved_homes add column county_key text;
alter table saved_homes add column scope_key text;
alter table saved_searches add column county_key text;
alter table saved_searches add column status text not null default 'active';

alter table vow_authorization_attempts add column pkce_verifier_ciphertext text;
alter table vow_authorization_attempts add column provider_issuer text;
alter table vow_authorization_attempts add column provider_subject text;
alter table vow_authorization_attempts add column user_email_normalized text;
alter table vow_authorization_attempts add column session_id text;

create table if not exists vow_account_grants (
  id text primary key,
  user_account_id text not null references user_accounts(id),
  scope_key text not null references mls_authorization_scopes(scope_key),
  issuer text not null,
  subject text not null,
  email_normalized text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_type text not null default 'Bearer',
  access_expires_at text,
  granted_scopes text,
  status text not null default 'active' check (
    status in ('active','expired','revoked','failed')
  ),
  last_verified_at text not null default CURRENT_TIMESTAMP,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP,
  unique(user_account_id, scope_key),
  unique(scope_key, issuer, subject)
);
create index if not exists vow_account_grants_account_idx
  on vow_account_grants(user_account_id, status);
create index if not exists vow_account_grants_scope_idx
  on vow_account_grants(scope_key, status);

create table if not exists account_audit_events (
  id text primary key,
  user_account_id text references user_accounts(id),
  session_id text references user_auth_sessions(id),
  event_type text not null check (
    event_type in (
      'vow_authorization_started',
      'vow_authorization_completed',
      'vow_authorization_rejected',
      'session_created',
      'session_revoked',
      'saved_home_created',
      'saved_home_deleted',
      'saved_search_created',
      'saved_search_deleted'
    )
  ),
  scope_key text,
  payload_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP
);
create index if not exists account_audit_events_account_idx
  on account_audit_events(user_account_id, created_at);
create index if not exists account_audit_events_type_idx
  on account_audit_events(event_type, created_at);
