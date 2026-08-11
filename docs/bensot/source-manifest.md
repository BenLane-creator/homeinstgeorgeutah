---
type: source-manifest
system: BenSOT
status: active
authority: canonical
project: HomeInStGeorgeUtah
---

# BenSOT Source Manifest

This manifest identifies the authoritative sources for this project.

## Project authority

- `docs/source-of-truth.md`
  - existing project source-of-truth declaration
  - defines internal and external authority boundaries

- `docs/revised-master-architecture-spec.md`
  - controlling internal project architecture
  - authority established by `docs/source-of-truth.md`

## Implementation authority

- `apps/api/src/`
  - first-party API implementation

- `packages/db/`
  - database schema and migrations

- `.github/workflows/`
  - repository automation and release controls

- `apps/api/wrangler.toml`
  - Cloudflare Worker deployment configuration

## BenDESK governance

- `docs/bensot/`
  - authority manifests and canonical declarations

- `docs/vocabulary/`
  - canonical naming and terminology standards

- `docs/bencode/`
  - implementation and engineering conventions

- `docs/bennote/`
  - Obsidian-compatible human knowledge interface

## External authority

Spark Platform documentation remains the canonical external MLS/API reference
where established by `docs/source-of-truth.md`.

## Authority rule

Indexes, catalogs, generated artifacts, exports, notes, and derivatives do not
become authoritative merely because they exist.

Canonical authority must be explicitly declared by BenSOT or an authority record
recognized by this manifest.

## Supersession rule

A new document does not silently replace an existing canonical record.

Supersession must identify:

- predecessor
- successor
- effective state
- reason
- provenance
- verification evidence
