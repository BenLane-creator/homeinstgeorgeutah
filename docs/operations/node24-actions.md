# GitHub Actions Node 24 migration

GitHub Actions JavaScript actions must run on Node 24-compatible releases.

Repository policy:

- `actions/checkout` uses `v6`, which declares `node24`.
- `oven-sh/setup-bun` remains on `v2`, whose current action runtime declares `node24`.
- Do not set `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true`.
- Keep GitHub-hosted runners on `ubuntu-latest` unless a tested compatibility requirement dictates otherwise.
- Review third-party action runtime declarations before introducing new workflow actions.

The workflow application runtime remains Bun; this policy concerns the JavaScript runtime used internally by GitHub Actions.
