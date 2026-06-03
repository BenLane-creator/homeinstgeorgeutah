PRAGMA foreign_keys = ON;

create table if not exists user_preferences (
  id text primary key,
  user_account_id text references user_accounts(id),
  preference_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists user_preferences_user_idx on user_preferences(user_account_id);

create table if not exists display_rule_snapshots (
  id text primary key,
  provider text not null,
  agreement_scope text not null,
  rule_json text not null default '{}',
  source_document text,
  created_at text not null default CURRENT_TIMESTAMP
);
create index if not exists display_rule_snapshots_provider_idx on display_rule_snapshots(provider);
create index if not exists display_rule_snapshots_scope_idx on display_rule_snapshots(agreement_scope);
