#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---local}"
CONFIRM="${2:-}"

if [[ "$MODE" != "--local" && "$MODE" != "--remote" ]]; then
  echo "Usage: $0 [--local|--remote] [--confirm-remote-cleanup]"
  exit 1
fi

if [[ "$MODE" == "--remote" && "$CONFIRM" != "--confirm-remote-cleanup" ]]; then
  echo "Remote cleanup is blocked by default."
  echo "To run remote cleanup, use:"
  echo "$0 --remote --confirm-remote-cleanup"
  exit 1
fi

CONFIG="apps/api/wrangler.toml"
DATABASE="homeinstgeorgeutah"

echo "Cleaning smoke test leads from ${MODE#--} database."
echo "Target pattern: email_normalized like 'smoke-%@example.com'"

read -r -d '' SQL <<'SQL' || true
delete from routing_decisions
where contact_id in (
  select id from contacts where email_normalized like 'smoke-%@example.com'
);

delete from lead_events
where contact_id in (
  select id from contacts where email_normalized like 'smoke-%@example.com'
);

delete from attribution_sessions
where contact_id in (
  select id from contacts where email_normalized like 'smoke-%@example.com'
);

delete from property_context
where id not in (
  select distinct property_context_id
  from lead_events
  where property_context_id is not null
);

delete from contacts
where email_normalized like 'smoke-%@example.com';
SQL

bunx wrangler d1 execute "$DATABASE" \
  "$MODE" \
  --config "$CONFIG" \
  --command "$SQL"

echo
echo "Remaining smoke contacts:"
bunx wrangler d1 execute "$DATABASE" \
  "$MODE" \
  --config "$CONFIG" \
  --command "select count(*) as smoke_contact_count from contacts where email_normalized like 'smoke-%@example.com';"
