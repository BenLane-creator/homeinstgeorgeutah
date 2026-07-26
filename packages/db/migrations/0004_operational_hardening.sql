PRAGMA foreign_keys = ON;

create table if not exists lead_intake_requests (
  idempotency_key text primary key,
  request_hash text not null,
  contact_id text not null references contacts(id),
  lead_event_id text not null unique references lead_events(id),
  routing_decision_id text not null unique references routing_decisions(id),
  workflow_lane text not null,
  status text not null default 'stored' check (status in ('stored','rejected')),
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists lead_intake_requests_contact_idx
  on lead_intake_requests(contact_id);

create table if not exists notification_outbox (
  id text primary key,
  lead_event_id text not null references lead_events(id),
  contact_id text not null references contacts(id),
  notification_type text not null check (notification_type in ('owner_lead')),
  recipient text not null,
  status text not null default 'queued' check (
    status in ('queued','sending','sent','failed','dead')
  ),
  attempts integer not null default 0,
  next_attempt_at text,
  last_attempt_at text,
  delivered_at text,
  provider_message_id text,
  last_error text,
  payload_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP,
  unique(lead_event_id, notification_type, recipient)
);
create index if not exists notification_outbox_status_idx
  on notification_outbox(status, next_attempt_at);
create index if not exists notification_outbox_lead_idx
  on notification_outbox(lead_event_id);

create table if not exists data_subject_requests (
  id text primary key,
  request_type text not null check (request_type in ('access','export','correction','deletion')),
  requester_email_normalized text not null,
  contact_id text references contacts(id),
  status text not null default 'received' check (
    status in ('received','identity_verification','in_progress','completed','denied')
  ),
  owner text not null default 'technical-owner',
  due_at text,
  completed_at text,
  resolution_notes text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists data_subject_requests_status_idx
  on data_subject_requests(status, due_at);

create table if not exists incident_events (
  id text primary key,
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','contained','resolved','closed')),
  summary text not null,
  owner text not null,
  detected_at text not null default CURRENT_TIMESTAMP,
  contained_at text,
  resolved_at text,
  payload_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists incident_events_status_idx
  on incident_events(status, severity);

alter table listing_cache add column county_key text;
alter table listing_cache add column scope_key text;
alter table listing_cache add column property_type text;
alter table listing_cache add column property_sub_type text;
alter table listing_cache add column address_display text;
alter table listing_cache add column lot_size_acres real;
alter table listing_cache add column list_office_name text;
alter table listing_cache add column source_modified_at text;
alter table listing_cache add column cache_expires_at text;

create unique index if not exists listing_cache_county_source_unique_idx
  on listing_cache(county_key, source_listing_key);
create index if not exists listing_cache_county_status_idx
  on listing_cache(county_key, standard_status);
create index if not exists listing_cache_price_idx
  on listing_cache(list_price);

create table if not exists mls_sync_runs (
  id text primary key,
  scope_key text not null references mls_authorization_scopes(scope_key),
  status text not null check (status in ('started','succeeded','failed','skipped')),
  records_received integer not null default 0,
  records_written integer not null default 0,
  cursor_before text,
  cursor_after text,
  error_code text,
  error_message text,
  started_at text not null default CURRENT_TIMESTAMP,
  completed_at text
);
create index if not exists mls_sync_runs_scope_idx
  on mls_sync_runs(scope_key, started_at);
