#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8787}"
EMAIL="smoke-$(date +%s)@example.com"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

post_json() {
  local payload="$1"
  curl -sS -o "$tmp" -w "%{http_code}" \
    -X POST "${API_BASE}/api/v1/leads/intake" \
    -H "content-type: application/json" \
    -d "$payload"
}

expect_status() {
  local expected="$1"
  local payload="$2"
  local label="$3"

  local status
  status="$(post_json "$payload")"

  if [[ "$status" != "$expected" ]]; then
    echo "FAIL: ${label}"
    echo "Expected HTTP ${expected}, got ${status}"
    cat "$tmp"
    exit 1
  fi

  echo "PASS: ${label} returned HTTP ${expected}"
}

echo "Testing ${API_BASE}/api/v1/leads/intake"
echo "Using smoke email: ${EMAIL}"

expect_status "400" '{
  "intent": "general_contact",
  "name": "Missing Consent",
  "email": "missing-consent@example.com",
  "message": "Should fail because consent is missing."
}' "missing consent"

expect_status "400" '{
  "intent": "general_contact",
  "name": "Bad Email",
  "email": "not-an-email",
  "message": "Should fail because email is invalid.",
  "consent": true
}' "bad email"

expect_status "400" '{
  "intent": "general_contact",
  "email": "missing-name@example.com",
  "message": "Should fail because name is missing.",
  "consent": true
}' "missing name"

expect_status "201" "{
  \"intent\": \"general_contact\",
  \"name\": \"Smoke Lead\",
  \"email\": \"${EMAIL}\",
  \"phone\": \"435-555-1111\",
  \"message\": \"First smoke lead submission.\",
  \"pageUrl\": \"https://homeinstgeorgeutah.com/contact\",
  \"consent\": true,
  \"deviceCategory\": \"desktop\",
  \"screenWidth\": \"1440\",
  \"screenHeight\": \"900\"
}" "first valid lead"

python3 - "$tmp" <<'PY'
import json
import sys

with open(sys.argv[1]) as f:
    payload = json.load(f)

assert payload["ok"] is True
assert payload["data"]["workflowLane"] == "general_contact"
print("PASS: first valid lead stored with general_contact workflow lane")
PY

expect_status "201" "{
  \"intent\": \"general_contact\",
  \"name\": \"Smoke Lead Updated\",
  \"email\": \"${EMAIL}\",
  \"phone\": \"435-555-2222\",
  \"message\": \"Second smoke lead submission with same email.\",
  \"pageUrl\": \"https://homeinstgeorgeutah.com/contact\",
  \"consent\": true,
  \"deviceCategory\": \"desktop\",
  \"screenWidth\": \"1440\",
  \"screenHeight\": \"900\"
}" "duplicate email valid lead"

echo
echo "Verify duplicate email produced one contact:"
bunx wrangler d1 execute homeinstgeorgeutah \
  --local \
  --config apps/api/wrangler.toml \
  --command "select count(*) as contact_count from contacts where email_normalized = '${EMAIL}';"

echo
echo "Verify latest lead events:"
bunx wrangler d1 execute homeinstgeorgeutah \
  --local \
  --config apps/api/wrangler.toml \
  --command "select intent_type, workflow_lane, page_url from lead_events where contact_id = (select id from contacts where email_normalized = '${EMAIL}' limit 1) order by created_at desc limit 5;"

echo
echo "Smoke test complete."
