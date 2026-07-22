PRAGMA foreign_keys = ON;

create table if not exists contacts (
  id text primary key,
  full_name text not null,
  first_name text,
  last_name text,
  email text not null,
  email_normalized text not null,
  phone text,
  phone_normalized text,
  source text not null default 'website',
  status text not null default 'active',
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists contacts_email_idx on contacts(email_normalized);
create index if not exists contacts_phone_idx on contacts(phone_normalized);

create table if not exists attribution_sessions (
  id text primary key,
  contact_id text references contacts(id),
  landing_page_url text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_category text,
  screen_width text,
  screen_height text,
  user_agent text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists attribution_contact_idx on attribution_sessions(contact_id);

create table if not exists property_context (
  id text primary key,
  listing_id text,
  source_listing_key text,
  page_url text,
  geo_context text,
  source text not null default 'lead_intake',
  created_at text not null default CURRENT_TIMESTAMP
);
create index if not exists property_context_listing_idx on property_context(listing_id);

create table if not exists lead_events (
  id text primary key,
  contact_id text references contacts(id),
  attribution_session_id text references attribution_sessions(id),
  property_context_id text references property_context(id),
  event_type text not null,
  intent_type text not null,
  workflow_lane text not null check (workflow_lane in ('seller_high_priority','valuation','buyer_active_search','buyer_early_stage','relocation','property_inquiry','showing_request','general_contact','booked_consult','nurture')),
  message text,
  page_url text,
  consent integer not null default 0,
  payload_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP
);
create index if not exists lead_events_contact_idx on lead_events(contact_id);
create index if not exists lead_events_created_idx on lead_events(created_at);
create index if not exists lead_events_intent_idx on lead_events(intent_type);
create index if not exists lead_events_lane_idx on lead_events(workflow_lane);

create table if not exists routing_decisions (
  id text primary key,
  contact_id text references contacts(id),
  lead_event_id text references lead_events(id),
  workflow_lane text not null,
  reason text,
  assigned_to text,
  status text not null default 'new',
  created_at text not null default CURRENT_TIMESTAMP
);
create index if not exists routing_decisions_lane_idx on routing_decisions(workflow_lane);
create index if not exists routing_decisions_status_idx on routing_decisions(status);

create table if not exists ai_runs (
  id text primary key,
  contact_id text references contacts(id),
  lead_event_id text references lead_events(id),
  run_type text not null,
  status text not null default 'queued',
  input_json text,
  output_json text,
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists ai_handoffs (
  id text primary key,
  ai_run_id text references ai_runs(id),
  contact_id text references contacts(id),
  handoff_type text not null,
  status text not null default 'new',
  summary text,
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists crm_sync_jobs (
  id text primary key,
  contact_id text references contacts(id),
  lead_event_id text references lead_events(id),
  downstream_system text not null default 'crm',
  status text not null default 'queued',
  attempts integer not null default 0,
  payload_json text,
  last_error text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists crm_sync_jobs_status_idx on crm_sync_jobs(status);

create table if not exists booking_handoffs (
  id text primary key,
  contact_id text references contacts(id),
  lead_event_id text references lead_events(id),
  status text not null default 'queued',
  eligibility_reason text,
  payload_json text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists booking_handoffs_status_idx on booking_handoffs(status);

create table if not exists user_accounts (
  id text primary key,
  contact_id text references contacts(id),
  email text not null,
  email_normalized text not null,
  status text not null default 'active',
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);

create table if not exists user_auth_sessions (
  id text primary key,
  user_account_id text references user_accounts(id),
  session_hash text not null,
  expires_at text not null,
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists saved_homes (
  id text primary key,
  user_account_id text references user_accounts(id),
  listing_id text not null,
  source_listing_key text,
  created_at text not null default CURRENT_TIMESTAMP
);
create index if not exists saved_homes_user_idx on saved_homes(user_account_id);
create index if not exists saved_homes_listing_idx on saved_homes(listing_id);

create table if not exists saved_searches (
  id text primary key,
  user_account_id text references user_accounts(id),
  name text,
  query_json text not null default '{}',
  alert_frequency text not null default 'daily',
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists saved_searches_user_idx on saved_searches(user_account_id);

create table if not exists search_subscriptions (
  id text primary key,
  saved_search_id text references saved_searches(id),
  status text not null default 'active',
  last_sent_at text,
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists property_inquiries (
  id text primary key,
  lead_event_id text references lead_events(id),
  listing_id text,
  status text not null default 'new',
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists showing_requests (
  id text primary key,
  lead_event_id text references lead_events(id),
  listing_id text,
  preferred_time text,
  status text not null default 'new',
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists lead_scores (
  id text primary key,
  contact_id text references contacts(id),
  score integer not null default 0,
  reason_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists intent_snapshots (
  id text primary key,
  contact_id text references contacts(id),
  primary_intent text not null,
  confidence integer not null default 0,
  snapshot_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists listing_cache (
  id text primary key,
  provider text not null,
  source_listing_key text not null,
  standard_status text,
  city text,
  state_or_province text,
  postal_code text,
  list_price integer,
  bedrooms_total integer,
  bathrooms_total integer,
  living_area integer,
  raw_json text,
  display_json text,
  last_synced_at text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);
create index if not exists listing_cache_source_key_idx on listing_cache(source_listing_key);
create index if not exists listing_cache_status_idx on listing_cache(standard_status);
create index if not exists listing_cache_city_idx on listing_cache(city);

create table if not exists listing_media (
  id text primary key,
  listing_id text references listing_cache(id),
  media_url text not null,
  media_type text,
  sort_order integer,
  rights_json text,
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists listing_open_houses (
  id text primary key,
  listing_id text references listing_cache(id),
  start_at text not null,
  end_at text,
  remarks text,
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists listing_status_history (
  id text primary key,
  listing_id text references listing_cache(id),
  status text not null,
  changed_at text not null,
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists content_pages (
  id text primary key,
  slug text not null,
  title text not null,
  status text not null default 'draft',
  body text,
  seo_json text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);

create table if not exists seo_landing_pages (
  id text primary key,
  slug text not null,
  geo_entity_id text,
  query_json text not null default '{}',
  title text not null,
  status text not null default 'draft',
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);

create table if not exists geo_entities (
  id text primary key,
  slug text not null,
  name text not null,
  entity_type text not null,
  parent_id text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);

create table if not exists market_reports (
  id text primary key,
  geo_entity_id text references geo_entities(id),
  report_period text not null,
  data_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists audit_logs (
  id text primary key,
  actor_type text not null,
  action text not null,
  entity_type text,
  entity_id text,
  payload_json text not null default '{}',
  created_at text not null default CURRENT_TIMESTAMP
);

create table if not exists compliance_acceptances (
  id text primary key,
  contact_id text references contacts(id),
  user_account_id text references user_accounts(id),
  terms_key text not null,
  accepted_at text not null default CURRENT_TIMESTAMP,
  ip_address text,
  user_agent text
);

create table if not exists provider_sync_cursors (
  id text primary key,
  provider text not null,
  cursor_key text not null,
  cursor_value text,
  last_synced_at text,
  created_at text not null default CURRENT_TIMESTAMP,
  updated_at text not null default CURRENT_TIMESTAMP
);

create table if not exists external_identities (
  id text primary key,
  contact_id text references contacts(id),
  provider text not null,
  external_id text not null,
  created_at text not null default CURRENT_TIMESTAMP
);

