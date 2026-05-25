# Local Setup and Validation

Date: 2026-05-24

## Confirm you are in the repository root

Run this first:

```bash
pwd
ls package.json apps packages
bun pm pkg get name
bun pm pkg get scripts
```

Expected root package name:

```txt
homeinstgeorge-modern-stack
```

If `bun run check` says `Script not found "check"`, you are not in this repository root or you are using a different `package.json`.

If `bun --filter @home/api typecheck` says `No packages matched the filter`, Bun cannot see the workspace packages. This also means you are not in the repository root, or the ZIP was extracted with an extra wrapper folder and you are one level too high.

## Common extraction layout

If the ZIP was extracted into `~/Documents/realtor-site`, the actual repo root is likely:

```bash
cd ~/Documents/realtor-site/homeinstgeorge-modern-stack-inspected-source
```

If you renamed the folder, locate the repo root with:

```bash
find ~/Documents/realtor-site -maxdepth 3 -name package.json -print
```

Choose the folder whose `package.json` contains:

```json
"workspaces": ["apps/*", "packages/*"]
```

## Clean install and validation

From the repository root:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/.wrangler apps/site/dist
bun install
bun run check
bun run build:site
bun --filter @home/api typecheck
bun --filter @home/app build
python3 scripts/audit-neighborhood-links.py
```

## Expected root scripts

The root `package.json` includes these scripts:

```txt
dev:site
dev:api
dev:app
build
check
format
test
test:e2e
build:site
```

## Expected workspace packages

```txt
@home/site
@home/api
@home/app
@home/config
@home/ui
@home/db
```

## Fast diagnosis command

Use the included helper:

```bash
bash scripts/doctor-local.sh
```

It prints the current directory, root package name, scripts, workspaces, and workspace package names that Bun should be able to filter.
