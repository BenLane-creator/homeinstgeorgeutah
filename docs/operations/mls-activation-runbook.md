# MLS Activation and Kill-Switch Runbook

## Scope model

The application treats these as four independent authorization scopes:

- `washington-idx`
- `washington-vow`
- `iron-idx`
- `iron-vow`

Approval or credentials for one scope never authorize another. IDX never implies VOW, and Washington County never implies Iron County.

## Activation prerequisites

A scope may be activated only after all applicable evidence is on file:

1. MLS approval and executed terms.
2. Exact plan/role and Feed ID recorded.
3. Field, media, attribution, refresh, cache, retention, and purge rules encoded.
4. Production endpoint and server-side credentials configured.
5. Code-approved policy version matches the configured policy version.
6. The explicit scope enable flag is set to `true`.
7. Source-adapter contract tests pass against approved non-public data.
8. Canonical cache writes and public cache reads are verified.
9. Kill-switch test succeeds for that exact scope.
10. Broker and technical owner approve activation.

## IDX data path

```text
approved RESO-shaped source
  -> county-specific source adapter
  -> field allowlist and normalization
  -> county-specific sync cursor and run log
  -> canonical D1 listing cache
  -> internal read service
  -> public search response
```

Visitor requests never call the MLS provider directly. Raw provider records are not exposed to browsers and are not retained in the canonical cache. Media remains disabled until the applicable MLS media rights and rules are explicitly approved and encoded.

## Manual synchronization

Protected route:

```text
POST /api/internal/mls/sync
Authorization: Bearer <INTERNAL_JOB_TOKEN>
```

Optional county selector:

```text
POST /api/internal/mls/sync?county=washington
POST /api/internal/mls/sync?county=iron
```

When a scope is pending, disabled, missing its approved policy version, or missing credentials, the operation records a skipped run and does not contact the provider.

## IDX activation sequence

For one county at a time:

1. Record the approved plan, Feed ID, effective terms, and policy version.
2. Configure provider name and HTTPS RESO base URL.
3. Add the access token as a server-side secret.
4. Leave the enable flag `false` and run Wrangler validation.
5. In an isolated preview environment, temporarily activate only that county's IDX scope.
6. Run one controlled sync and inspect normalized fields, cache membership, attribution, status handling, cursor movement, and logs.
7. Verify public search reads D1 and does not make a provider request.
8. Disable the scope and prove the search returns the honest unavailable/contact state.
9. Record broker and technical approval.
10. Enable the approved production scope.

Repeat independently for the other county.

## VOW authorization and account path

```text
active county VOW scope
  -> signed one-time OAuth state
  -> provider authorization and code exchange
  -> current-contact identity verification
  -> AES-GCM encrypted provider tokens in D1
  -> first-party HttpOnly/Secure/SameSite session
  -> county-scoped VOW grant
  -> owned saved homes and saved searches
```

Provider access and refresh tokens never enter browser storage, cookies, URL fragments, or API responses. The callback accepts only a valid signed, unexpired, and unclaimed state record. Local sessions expose only the owned account identity and county grants.

For one county at a time, VOW activation additionally requires:

1. Approved authorization, token, and current-contact endpoints.
2. Approved client ID and server-side client secret.
3. `VOW_STATE_SECRET` and a distinct `VOW_TOKEN_ENCRYPTION_KEY` configured server-side.
4. The exact registered callback URI verified with the provider.
5. Controlled authorization, state-replay rejection, token-encryption, identity-linking, logout, and saved-data tests.
6. Confirmation that disabling the county scope blocks new authorization and VOW-restricted display without affecting the other county.
7. Broker and technical-owner approval recorded before the enable flag changes.

The implementation is complete but remains fail-closed until those county-specific approvals, values, tests, and activation decisions are recorded.

## Kill switch

To stop one scope immediately:

1. Set that exact scope's enable flag to `false`.
2. Deploy the Worker configuration change only after the incident/change record is opened.
3. Confirm `/api/mls-status` reports the scope inactive.
4. Confirm public search or VOW authorization returns the honest unavailable state for that county.
5. Stop source synchronization or new VOW authorization for the scope.
6. Revoke or expire sessions and provider tokens when required by the MLS rule or incident response.
7. Purge or retain cached records strictly according to the applicable MLS rule and incident/legal instructions.
8. Do not disable the other county or role unless separately required.

## Current project state

All four subscriptions are pending. Production activation flags must remain `false`; no live listing, VOW-restricted field, sold data, listing-detail page, public mock listing, or scraped listing may be enabled.
