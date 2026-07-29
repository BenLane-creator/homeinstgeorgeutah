PRAGMA foreign_keys = ON;

alter table vow_authorization_attempts add column nonce_hash text;

alter table vow_access_grants add column provider_issuer text;
alter table vow_access_grants add column provider_subject text;

create index if not exists vow_access_grants_subject_idx
  on vow_access_grants(provider_issuer, provider_subject, status);
