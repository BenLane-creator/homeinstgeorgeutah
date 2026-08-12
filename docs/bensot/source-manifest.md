---
type: source-manifest
system: BenSOT
status: active
authority: canonical
project: HomeInStGeorgeUtah
---

# BenSOT Source Manifest

BenSOT identifies and governs authoritative sources. It does not create a
competing source of truth.

## Existing project authority

### Project Source of Truth

`docs/source-of-truth.md`

Status: canonical authority declaration.

This record defines the project's internal architecture authority and external
MLS/API authority boundaries.

### Controlling Architecture

`docs/revised-master-architecture-spec.md`

Status: controlling internal architecture.

Authority is established by `docs/source-of-truth.md`.

## Implementation authority

### API

`apps/api/src/`

Status: canonical first-party API implementation.

### Database

`packages/db/`

Status: canonical database schema and migration implementation.

### Deployment

`.github/workflows/`

`apps/api/wrangler.toml`

Status: canonical repository automation and Worker deployment configuration.

## BenDESK governance

### BenSOT

`docs/bensot/`

Function: authority, canonical declarations, provenance, supersession, and
source manifests.

### BenNOTE

`docs/bennote/`

Function: Obsidian-compatible human knowledge interface.

BenNOTE may organize and expose canonical information but does not independently
establish authority.

### BenCODE

`docs/bencode/`

Function: code, implementation, repository, automation, testing, and engineering
standards.

### Vocabulary

`docs/vocabulary/`

Function: canonical naming and terminology standards.

## External authority

Spark Platform documentation remains the canonical external MLS/API reference
where established by `docs/source-of-truth.md`.

## Authority rule

Existence does not establish authority.

Indexes, notes, catalogs, generated artifacts, exports, reports, derivatives,
and copied documents are non-authoritative unless explicitly declared
canonical by a recognized authority record.

## Supersession rule

Canonical records MUST NOT be silently replaced.

A supersession record must identify:

- predecessor
- successor
- effective status
- reason
- provenance
- verification evidence

## Resolution rule

When two records appear to conflict:

1. inspect their declared authority;
2. inspect provenance and supersession state;
3. prefer the explicitly controlling canonical record;
4. preserve the displaced record as historical evidence where appropriate;
5. record the resolution rather than silently rewriting history.
