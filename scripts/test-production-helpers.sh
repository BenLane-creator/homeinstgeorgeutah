#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
fixture_dir="$(mktemp -d)"
trap 'rm -rf "$fixture_dir"' EXIT

cat > "$fixture_dir/export.sql" <<'SQL'
create table contacts (id text primary key);
create table lead_events (id text primary key);
create table routing_decisions (id text primary key);
create table listing_cache (id text primary key);
create table d1_migrations (id integer primary key, name text not null);
insert into d1_migrations (id, name) values (1, '0001_foundation.sql');
SQL
bun scripts/verify-d1-export.mjs "$fixture_dir/export.sql" > "$fixture_dir/export-result.json"

test_sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
version_id="11111111-1111-4111-8111-111111111111"
cat > "$fixture_dir/pages.json" <<JSON
[{"environment":"production","deployment_trigger":{"metadata":{"commit_hash":"$test_sha"}}}]
JSON
cat > "$fixture_dir/versions.json" <<JSON
[{"id":"$version_id","annotations":{"workers/tag":"$test_sha","workers/message":"release-sha:$test_sha"}}]
JSON
cat > "$fixture_dir/deployment.json" <<JSON
{"versions":[{"version_id":"$version_id"}]}
JSON
bun scripts/verify-production-deployment.mjs \
  "$test_sha" \
  "$fixture_dir/pages.json" \
  "$fixture_dir/versions.json" \
  "$fixture_dir/deployment.json" \
  > "$fixture_dir/deployment-result.json"

pages_project="homeinstgeorgeutah-cloudflare"
cat > "$fixture_dir/pages-projects-api.json" <<JSON
[{"name":"$pages_project"}]
JSON
cat > "$fixture_dir/pages-projects-wrangler.json" <<JSON
[{"Project Name":"$pages_project","Project Domains":"$pages_project.pages.dev, homeinstgeorgeutah.com, www.homeinstgeorgeutah.com","Git Provider":"Yes","Last Modified":"1 hour ago"}]
JSON
bun scripts/verify-pages-project-list.mjs \
  "$pages_project" \
  "$fixture_dir/pages-projects-api.json" \
  > "$fixture_dir/pages-project-api-result.json"
bun scripts/verify-pages-project-list.mjs \
  "$pages_project" \
  "$fixture_dir/pages-projects-wrangler.json" \
  > "$fixture_dir/pages-project-wrangler-result.json"
if bun scripts/verify-pages-project-list.mjs \
  "missing-pages-project" \
  "$fixture_dir/pages-projects-wrangler.json" \
  > /dev/null 2>&1; then
  echo "Pages project verifier accepted a missing project." >&2
  exit 1
fi

cat > "$fixture_dir/wrangler.toml" <<'TOML'
account_id = "test-account"
[[d1_databases]]
binding = "DB"
database_name = "homeinstgeorgeutah"
database_id = "test-database-id"
TOML
cat > "$fixture_dir/d1-list.json" <<'JSON'
[{"name":"homeinstgeorgeutah","uuid":"test-database-id"}]
JSON
cat > "$fixture_dir/d1-info.json" <<'JSON'
[{"name":"homeinstgeorgeutah","version":"production"}]
JSON
applied_migrations="$(find packages/db/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort | paste -sd '|' -)"
printf '[{"results":[{"applied_migrations":"%s","unique_index_count":1,"duplicate_email_group_count":0}]}]\n' \
  "$applied_migrations" > "$fixture_dir/d1-state.json"
cat > "$fixture_dir/worker-deployment.json" <<JSON
{"versions":[{"version_id":"$version_id"}]}
JSON
cat > "$fixture_dir/worker-secrets.json" <<'JSON'
[{"name":"INTERNAL_JOB_TOKEN"},{"name":"TURNSTILE_SECRET_KEY"},{"name":"VOW_TOKEN_ENCRYPTION_KEY"}]
JSON
cat > "$fixture_dir/health.json" <<'JSON'
{"ok":true,"data":{"service":"homeinstgeorgeutah-api","status":"ok"}}
JSON
cat > "$fixture_dir/mls-status.json" <<'JSON'
{"ok":true,"data":{"active":false,"scopes":[{"key":"washington-idx","active":false},{"key":"washington-vow","active":false},{"key":"iron-idx","active":false},{"key":"iron-vow","active":false}]}}
JSON
cat > "$fixture_dir/account-session.json" <<'JSON'
{"ok":true,"data":{"authenticated":false,"account":null}}
JSON

CLOUDFLARE_ACCOUNT_ID=test-account D1_DATABASE=homeinstgeorgeutah \
  bun scripts/verify-production-preflight.mjs \
    --config="$fixture_dir/wrangler.toml" \
    --d1List="$fixture_dir/d1-list.json" \
    --d1Info="$fixture_dir/d1-info.json" \
    --d1State="$fixture_dir/d1-state.json" \
    --workerDeployment="$fixture_dir/worker-deployment.json" \
    --workerSecrets="$fixture_dir/worker-secrets.json" \
    --health="$fixture_dir/health.json" \
    --mlsStatus="$fixture_dir/mls-status.json" \
    --accountSession="$fixture_dir/account-session.json" \
    > "$fixture_dir/preflight-result.json"

cat > "$fixture_dir/homepage.html" <<'HTML'
<!doctype html>
<html>
  <head>
    <style>.hidden { display: none; }</style>
    <script>const misleading = "Better Real Estate Decisions.";</script>
  </head>
  <body>
    <h1>
      <span>Better</span>
      <span>Real Estate</span>
      <span>Decisions.</span>
    </h1>
  </body>
</html>
HTML
FIXTURE_PATH="$fixture_dir/homepage.html" bun -e '
  import { readFileSync } from "node:fs";
  import { homepageHasCanonicalHeadline } from "./scripts/homepage-contract.mjs";
  const html = readFileSync(process.env.FIXTURE_PATH, "utf8");
  if (!homepageHasCanonicalHeadline(html)) {
    throw new Error("Split semantic homepage headline was not recognized.");
  }
  if (homepageHasCanonicalHeadline(html.replace("Decisions.</span>", "Choices.</span>"))) {
    throw new Error("Drifted homepage headline was accepted.");
  }
'

echo "Production release helper fixtures passed."
