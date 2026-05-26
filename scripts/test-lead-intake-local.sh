#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8787}"
API_ENDPOINT="${API_URL%/}/api/v1/leads/intake"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
API_DIR="${REPO_ROOT}/apps/api"

cd "${API_DIR}"

echo "Testing lead intake endpoint:"
echo "${API_ENDPOINT}"
echo

echo "Posting test lead..."
RESPONSE="$(
	curl -sS -X POST "${API_ENDPOINT}" \
		-H "content-type: application/json" \
		-d '{
			"intent": "buyer_active_search",
			"name": "Test Lead",
			"email": "test@example.com",
			"phone": "555-555-5555",
			"message": "I am looking for homes in St. George.",
			"pageUrl": "https://HomeInStGeorgeUtah.com/buyers",
			"city": "St. George",
			"consent": true,
			"utm": {
				"source": "local-test",
				"medium": "manual",
				"campaign": "phase-2"
			}
		}'
)"

echo "${RESPONSE}"
echo

if ! printf '%s' "${RESPONSE}" | grep -q '"ok": true'; then
	echo "Lead intake failed: response did not include ok=true." >&2
	exit 1
fi

if ! printf '%s' "${RESPONSE}" | grep -q '"workflowLane": "buyer_active_search"'; then
	echo "Lead intake failed: response did not route to buyer_active_search." >&2
	exit 1
fi

echo "Latest contacts in local D1:"
bunx wrangler d1 execute DB \
	--local \
	--command "SELECT id, full_name, email, phone FROM contacts ORDER BY created_at DESC LIMIT 5;" \
	--json

echo
echo "Latest routing decisions in local D1:"
bunx wrangler d1 execute DB \
	--local \
	--command "SELECT workflow_lane, reason FROM routing_decisions ORDER BY created_at DESC LIMIT 5;" \
	--json

echo
echo "Lead intake smoke test passed."
