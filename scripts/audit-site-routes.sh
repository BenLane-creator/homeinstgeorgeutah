#!/usr/bin/env bash

set -u

BASE_URL="http://localhost:4321"
DIST_DIR="apps/site/dist"
REPORT="reports/site-route-audit.txt"

routes=(
  "/"
  "/about/"
  "/buyers/"
  "/sellers/"
  "/relocation/"
  "/contact/"
  "/blog/"
  "/blog/st-george-market-guidance/"
  "/horse-properties/"
  "/seller-financing/"
  "/neighborhoods/"
  "/neighborhoods/st-george/"
  "/neighborhoods/washington/"
  "/neighborhoods/hurricane/"
  "/neighborhoods/ivins/"
  "/neighborhoods/santa-clara/"
  "/neighborhoods/entrada/"
  "/neighborhoods/little-valley/"
  "/neighborhoods/washington-fields/"
  "/neighborhoods/apple-valley/"
  "/neighborhoods/dammeron-valley/"
  "/neighborhoods/diamond-valley/"
  "/neighborhoods/veyo/"
  "/neighborhoods/central/"
  "/neighborhoods/new-harmony/"
  "/neighborhoods/enterprise/"
)

route_to_file() {
  local route="$1"

  if [[ "$route" == "/" ]]; then
    echo "$DIST_DIR/index.html"
  else
    route="${route#/}"
    route="${route%/}"
    echo "$DIST_DIR/$route/index.html"
  fi
}

{
  echo "=== BUILD CHECK ==="
  date
  echo

  echo "=== EXPECTED ROUTES ==="
  for route in "${routes[@]}"; do
    echo "$route"
  done
  echo

  echo "=== DIST FILE CHECK ==="
  dist_fail=0

  for route in "${routes[@]}"; do
    file="$(route_to_file "$route")"

    if [[ -f "$file" ]]; then
      echo "PASS dist: $route -> $file"
    else
      echo "FAIL dist: $route -> missing $file"
      dist_fail=1
    fi
  done

  echo
  echo "=== LOCAL SERVER CHECK ==="
  echo "This requires bun run dev:site to be running in another terminal."
  echo

  local_fail=0

  for route in "${routes[@]}"; do
    url="$BASE_URL$route"
    status="$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)"

    if [[ "$status" == "200" || "$status" == "301" || "$status" == "302" ]]; then
      echo "PASS local: $status $url"
    else
      echo "FAIL local: $status $url"
      local_fail=1
    fi
  done

  echo
  echo "=== GENERATED NEIGHBORHOOD PAGES ==="
  find "$DIST_DIR/neighborhoods" -maxdepth 2 -name "index.html" | sort
  echo

  echo "=== GENERATED TOP LEVEL PAGES ==="
  find "$DIST_DIR" -maxdepth 2 -name "index.html" | sort
  echo

  echo "=== SUMMARY ==="
  if [[ "$dist_fail" == "0" ]]; then
    echo "DIST: PASS"
  else
    echo "DIST: FAIL"
  fi

  if [[ "$local_fail" == "0" ]]; then
    echo "LOCAL: PASS"
  else
    echo "LOCAL: FAIL"
  fi

} | tee "$REPORT"

echo
echo "Report saved to $REPORT"
