PRAGMA foreign_keys = ON;

-- Review production duplicates before applying this migration remotely.
-- The unique index is required for the atomic lead upsert in lead-service.ts.
create unique index if not exists contacts_email_normalized_unique_idx
  on contacts(email_normalized);
