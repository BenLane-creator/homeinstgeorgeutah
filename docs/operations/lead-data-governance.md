# Lead Data Governance

Status: implementation-ready; broker and legal/privacy approval remain required before production launch.

## Ownership

- Business owner and final decision authority: Joel Robertson, Robertson Real Estate.
- Technical operator: Ben Lane.
- Operational source of truth: Cloudflare D1 for contacts, consent, lead events, routing decisions, notification state, and data-subject request records.
- Downstream CRM, email, booking, SMS, and analytics services are replaceable utilities and may not become the canonical record.

## Collection boundary

The public application collects only the fields needed to respond to the visitor's real-estate request, attribute the request, enforce security, route it to the correct workflow lane, and document consent. Raw MLS provider records are not included in lead payloads. Provider credentials, tokens, private fields, and internal operational metadata are never exposed to browsers.

## Provisional retention schedule

The schedule below is the coded operating target and must be confirmed by the broker and legal/privacy reviewer before launch.

| Record class | Target retention | Disposal trigger |
|---|---:|---|
| Active contact and lead history | 24 months after last meaningful activity | No active transaction, legal hold, or broker-documented business need |
| Consent and compliance acceptance | 36 months after associated lead activity ends | No legal hold or governing requirement requiring longer retention |
| Notification outbox: sent | 90 days after delivery | Delivery and associated lead event are verified |
| Notification outbox: failed/dead | 90 days after final recovery decision | Failure has been resolved, manually handled, or documented as non-deliverable |
| Security and audit logs | 12 months | No active incident, investigation, or legal hold |
| MLS canonical listing cache | The shorter of the applicable MLS rule or configured cache policy | Scope disabled, authorization suspended, record expires, or MLS purge instruction applies |
| VOW authorization attempts | 30 days | Attempt completed, rejected, failed, or expired |

Deletion jobs must be implemented as controlled, auditable operations. No automated purge is enabled until the schedule is approved.

## Data-subject request workflow

Requests for access, export, correction, or deletion are recorded in `data_subject_requests`.

1. Record the request type, normalized requester email, receipt time, assigned owner, and due date.
2. Verify identity using a channel already associated with the contact. Do not disclose data before verification.
3. Locate records by normalized email, contact ID, phone, external identity, and user account as applicable.
4. Export data in a readable structured format without secrets, internal security controls, unrelated contacts, or MLS data not licensed for redistribution.
5. For correction, preserve the original audit trail and record the corrected canonical value.
6. For deletion, check transaction obligations, legal holds, MLS rules, and approved retention requirements before execution.
7. Complete or deny the request with a documented reason and completion timestamp.
8. Verify downstream utility deletion where data was legitimately copied, while keeping D1 as the controlling record of the request and outcome.

## Deletion order

When deletion is approved, remove or anonymize records in dependency-safe order:

1. notification payloads and downstream delivery copies;
2. saved searches, saved homes, sessions, and external identities;
3. AI runs, handoffs, booking handoffs, and CRM jobs;
4. property inquiries, showing requests, attribution, property context, routing decisions, and lead events;
5. contact and user account records;
6. retain only the minimum audit proof required to document that the request was completed.

## Export controls

Exports must be generated server-side by an authenticated internal operation, encrypted in transit, time-limited, and delivered only after identity verification. Export files may not contain API keys, access tokens, internal job tokens, Turnstile secrets, private MLS fields, raw provider payloads, or data belonging to another person.

## Launch evidence

Before launch, record:

- broker approval of the schedule and ownership assignments;
- legal/privacy approval of public privacy and consent language;
- a controlled export test;
- a controlled deletion/anonymization test;
- evidence that downstream utilities do not own canonical data;
- the person authorized to place or release a legal hold.
