#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---local}"

if [[ "$MODE" != "--local" && "$MODE" != "--remote" ]]; then
  echo "Usage: $0 [--local|--remote]"
  exit 1
fi

CONFIG="apps/api/wrangler.toml"
DATABASE="homeinstgeorgeutah"

echo "Checking D1 lead-engine schema in ${MODE#--} database."
echo "This script is read-only."

required_tables=(
  contacts
  attribution_sessions
  property_context
  lead_events
  routing_decisions
)

for table in "${required_tables[@]}"; do
  echo
  echo "===== ${table} ====="
  bunx wrangler d1 execute "$DATABASE" \
    "$MODE" \
    --config "$CONFIG" \
    --command "select name from sqlite_master where type = 'table' and name = '${table}';"

  bunx wrangler d1 execute "$DATABASE" \
    "$MODE" \
    --config "$CONFIG" \
    --command "pragma table_info(${table});"
done

echo
echo "Schema verification complete."
