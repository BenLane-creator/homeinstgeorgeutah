PRAGMA foreign_keys = ON;

-- A local consumer session must never outlive the earliest active VOW grant.
-- Normalize existing session timestamps to SQLite comparison format and fail
-- closed when no active grant exists for the account.
update user_auth_sessions
set expires_at = coalesce(
  min(
    datetime(expires_at),
    (
      select min(datetime(vag.expires_at))
      from vow_access_grants vag
      where vag.user_account_id = user_auth_sessions.user_account_id
        and vag.status = 'active'
        and vag.expires_at is not null
    )
  ),
  CURRENT_TIMESTAMP
);

create trigger if not exists user_auth_sessions_bound_to_vow_grants_after_insert
after insert on user_auth_sessions
for each row
BEGIN
  update user_auth_sessions
  set expires_at = coalesce(
    min(
      datetime(expires_at),
      (
        select min(datetime(vag.expires_at))
        from vow_access_grants vag
        where vag.user_account_id = NEW.user_account_id
          and vag.status = 'active'
          and vag.expires_at is not null
      )
    ),
    CURRENT_TIMESTAMP
  )
  where id = NEW.id;
END;

create trigger if not exists vow_access_grants_rebound_sessions_after_insert
after insert on vow_access_grants
for each row
BEGIN
  update user_auth_sessions
  set expires_at = coalesce(
    min(
      datetime(expires_at),
      (
        select min(datetime(vag.expires_at))
        from vow_access_grants vag
        where vag.user_account_id = NEW.user_account_id
          and vag.status = 'active'
          and vag.expires_at is not null
      )
    ),
    CURRENT_TIMESTAMP
  )
  where user_account_id = NEW.user_account_id;
END;

create trigger if not exists vow_access_grants_rebound_sessions_after_update
after update of status, expires_at on vow_access_grants
for each row
BEGIN
  update user_auth_sessions
  set expires_at = coalesce(
    min(
      datetime(expires_at),
      (
        select min(datetime(vag.expires_at))
        from vow_access_grants vag
        where vag.user_account_id = NEW.user_account_id
          and vag.status = 'active'
          and vag.expires_at is not null
      )
    ),
    CURRENT_TIMESTAMP
  )
  where user_account_id = NEW.user_account_id;
END;

create trigger if not exists vow_access_grants_expire_sessions_after_delete
after delete on vow_access_grants
for each row
BEGIN
  update user_auth_sessions
  set expires_at = coalesce(
    min(
      datetime(expires_at),
      (
        select min(datetime(vag.expires_at))
        from vow_access_grants vag
        where vag.user_account_id = OLD.user_account_id
          and vag.status = 'active'
          and vag.expires_at is not null
      )
    ),
    CURRENT_TIMESTAMP
  )
  where user_account_id = OLD.user_account_id;
END;
