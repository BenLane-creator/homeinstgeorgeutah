CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_unique
ON contacts(email)
WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS attribution_sessions (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  landing_url TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS property_context (
  id TEXT PRIMARY KEY,
  listing_id TEXT,
  property_url TEXT,
  city TEXT,
  neighborhood TEXT,
  address_summary TEXT,
  price TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_events (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  attribution_session_id TEXT,
  property_context_id TEXT,
  event_type TEXT NOT NULL,
  intent TEXT NOT NULL,
  message TEXT,
  raw_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (attribution_session_id) REFERENCES attribution_sessions(id),
  FOREIGN KEY (property_context_id) REFERENCES property_context(id)
);

CREATE TABLE IF NOT EXISTS routing_decisions (
  id TEXT PRIMARY KEY,
  lead_event_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  workflow_lane TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_event_id) REFERENCES lead_events(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS crm_sync_jobs (
  id TEXT PRIMARY KEY,
  lead_event_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_event_id) REFERENCES lead_events(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS booking_handoffs (
  id TEXT PRIMARY KEY,
  lead_event_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  eligible INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  booking_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_event_id) REFERENCES lead_events(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);
