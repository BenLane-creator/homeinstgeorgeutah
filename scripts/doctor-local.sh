#!/usr/bin/env bash
set -euo pipefail

printf '\n== Current directory ==\n'
pwd

printf '\n== Root files ==\n'
ls -la package.json apps packages 2>/dev/null || true

if [ ! -f package.json ]; then
  printf '\nERROR: No package.json in this directory. cd into the extracted project root.\n'
  printf 'Hint: find . -maxdepth 3 -name package.json -print\n'
  exit 1
fi

printf '\n== package.json name ==\n'
node -e "const p=require('./package.json'); console.log(p.name || '(missing name)')" 2>/dev/null || python3 - <<'PY'
import json
print(json.load(open('package.json')).get('name', '(missing name)'))
PY

printf '\n== scripts ==\n'
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts||{}).join('\n') || '(no scripts)')" 2>/dev/null || python3 - <<'PY'
import json
print('\n'.join(json.load(open('package.json')).get('scripts', {}).keys()) or '(no scripts)')
PY

printf '\n== workspaces ==\n'
node -e "const p=require('./package.json'); console.log((p.workspaces||[]).join('\n') || '(no workspaces)')" 2>/dev/null || python3 - <<'PY'
import json
print('\n'.join(json.load(open('package.json')).get('workspaces', [])) or '(no workspaces)')
PY

printf '\n== workspace package names found ==\n'
find apps packages -mindepth 2 -maxdepth 2 -name package.json -print 2>/dev/null | while read -r pkg; do
  node -e "const p=require('./$pkg'); console.log(p.name + '  <-  ' + '$pkg')" 2>/dev/null || python3 - "$pkg" <<'PY'
import json, sys
path = sys.argv[1]
p = json.load(open(path))
print(f"{p.get('name', '(missing name)')}  <-  {path}")
PY
done

printf '\n== Bun version ==\n'
if command -v bun >/dev/null 2>&1; then
  bun --version
else
  printf 'Bun not found on PATH.\n'
fi

printf '\n== Suggested next command ==\n'
if node -e "const p=require('./package.json'); process.exit(p.name==='homeinstgeorge-modern-stack' && p.workspaces ? 0 : 1)" 2>/dev/null; then
  printf 'bun install && bun run check && bun run build:site\n'
else
  printf 'This does not look like the project root. cd into homeinstgeorge-modern-stack-inspected-source first.\n'
fi
