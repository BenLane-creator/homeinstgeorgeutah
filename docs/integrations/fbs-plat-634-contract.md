# FBS Contact, Portal, OIDC, and Saved-Search Contract

Status: proposed integration contract; production-disabled  
FBS ticket: `PLAT-634`  
Site: `https://homeinstgeorgeutah.com`  
Designated Flexmls member: Joel Robertson (`stg.joelg`)  
Registered callback: `https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback`

## Objective

Give FBS one deterministic description of the HomeInStGeorgeUtah.com consumer
workflow and isolate every provider-specific decision behind one adapter. The
site will not activate the Contact-to-member-portal or VOW path until FBS
confirms the behavior affected by `PLAT-634` and supplies the unresolved wire
details below.

The TypeScript contract in
`apps/api/src/providers/fbs-contact-contract.ts` is our internal boundary. It is
not a claim about an existing FBS endpoint or payload format. Once FBS confirms
the wire contract, a small server-side adapter can translate between the two.

## Authority and ownership

| Concern | Owner | Rule |
|---|---|---|
| Local consumer account | HomeInStGeorgeUtah.com | Canonical account and workflow record |
| Flexmls Contact | FBS/Flexmls under `stg.joelg` | Created or matched server-to-server before OIDC |
| Consumer credentials | FBS/Flexmls | We never create, receive, store, or reset the password |
| OIDC authorization | FBS/Flexmls | Signals authenticated VOW eligibility for the linked Contact |
| Website session | HomeInStGeorgeUtah.com | Opaque, HttpOnly, Secure, SameSite cookie |
| Provider tokens | HomeInStGeorgeUtah.com server | AES-GCM encrypted; never exposed to the browser |
| Saved Search object | FBS/Flexmls Contact, subject to FBS confirmation | Site retains only its owned reference and presentation metadata |
| Favorites, inquiries, behavior | HomeInStGeorgeUtah.com | Local records; not represented as supported FBS consumer features |

## Required sequence

1. Consumer registers with HomeInStGeorgeUtah.com.
2. We create or match the local account and Contact in D1.
3. Our server submits one idempotent Contact-provisioning command to the FBS
   adapter for the selected county scope.
4. The adapter creates or matches the Flexmls Contact under `stg.joelg` and
   returns the stable provider Contact ID plus its readiness state.
5. We persist the provider Contact ID as the linked external identity.
6. If FBS requires an invitation, hosted registration, magic link, or other
   credential step, FBS owns that step. VOW remains unavailable until complete.
7. We begin OIDC only when FBS reports `contact-ready` and supplies the provider
   Contact ID.
8. FBS returns the browser to the registered callback with an authorization
   code and the exact state originally supplied by us.
9. Our server exchanges the code, obtains the current Contact identity, and
   verifies that the returned provider Contact ID equals the pre-linked ID.
10. Only after that equality check do we issue a first-party session and activate
    the county-specific VOW grant.
11. A mismatch, missing Contact ID, replayed state, expired state, provider
    error, inactive MLS scope, or unresolved `PLAT-634` condition fails closed.

## Our provider-neutral provisioning command

This is the complete semantic packet available to the eventual HTTP adapter.
Field names and encoding on the FBS wire may differ after FBS confirmation.

```json
{
  "contractVersion": "2026-08-06",
  "correlationId": "registration-01",
  "idempotencyKey": "contact:local-contact-01:washington-vow",
  "scopeKey": "washington-vow",
  "designatedMemberLogin": "stg.joelg",
  "callbackUri": "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback",
  "consumer": {
    "localAccountId": "local-account-01",
    "localContactId": "local-contact-01",
    "email": "consumer@example.com",
    "givenName": "Consumer",
    "familyName": "Example"
  },
  "requestedCapabilities": {
    "memberPortalAccess": true,
    "savedSearches": true,
    "consumerMayWriteContacts": false
  }
}
```

## Readiness result our adapter must produce

The FBS wire response may be translated into one of four explicit states:

| State | Provider Contact ID | May begin OIDC | Meaning |
|---|---:|---:|---|
| `contact-ready` | Required | Yes | Contact can authenticate through the intended portal/OIDC path |
| `consumer-action-required` | Optional | No | FBS owns an invitation, registration, verification, or credential step |
| `provider-pending` | Optional | No | FBS accepted the operation but readiness is not complete |
| `provider-blocked` | Optional | No | Provider defect or policy block; `PLAT-634` currently maps here |

An `authorizationReady: true` result is invalid unless the state is
`contact-ready` and a nonempty provider Contact ID is present.

## FBS confirmations needed to implement the HTTP adapter

1. Contact create-or-match endpoint, method, authentication scheme, required
   headers, content type, and exact request/response fields.
2. Whether FBS supports an idempotency key or a client-supplied external
   reference; otherwise, the approved deterministic lookup-before-create rule.
3. Required Contact fields and the canonical uniqueness/matching rule.
4. Exact operation that enables member-portal/VOW authentication for a Contact.
5. How we can determine that the Contact is ready for OIDC rather than merely
   created.
6. Credential-provisioning owner, initiation trigger, user experience, and
   completion signal.
7. OIDC discovery metadata or exact authorization/token endpoints, scopes,
   claims, token-request encoding, issuer, audience, JWKS behavior, and expiry.
8. Exact current-Contact endpoint and response field containing the stable
   Contact ID we must compare with the pre-linked ID.
9. Saved Search endpoint/schema and whether it must use Joel's server credential,
   the consumer's OIDC token, or another approved authorization method.
10. A non-production test Contact and expected responses for the conformance
    cases below.

## Conformance cases for FBS and our adapter

| Case | Required result |
|---|---|
| New Contact | One Contact under `stg.joelg`; stable ID returned |
| Retry after timeout | Same Contact returned; no duplicate |
| Existing matching Contact | Approved match returned or explicit conflict; never silent duplicate |
| Credential step incomplete | OIDC remains blocked and FBS-owned next step is identifiable |
| Credential step complete | Contact becomes deterministically ready for OIDC |
| OIDC callback identity | Current Contact ID equals the pre-linked Contact ID |
| Identity mismatch | No site session and no VOW grant |
| Disabled county scope | No provider call and no VOW access |
| `PLAT-634` unresolved | `provider-blocked`; production remains disabled |
| Saved Search | Object is associated with the authenticated individual Contact |

## Activation completion criteria

The integration is not production-ready until all of the following are recorded:

- FBS confirms `PLAT-634` is resolved for this workflow.
- The ten wire-contract questions above are answered.
- The adapter uses only server-side credentials and verified HTTPS endpoints.
- Every conformance case passes against FBS-approved non-production data.
- Provider Contact equality is enforced before any VOW grant.
- Washington and Iron County scopes remain independently approved and gated.
- The kill switch is tested for the exact scope being activated.
- Broker and technical-owner approval are recorded.

Until then, all affected production enable flags remain `false`.
