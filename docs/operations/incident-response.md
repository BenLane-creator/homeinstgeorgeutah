# Incident Response Procedure

Status: implementation-ready; production contact channels and escalation acknowledgments must be confirmed before launch.

## Owners

- Business and broker authority: Joel Robertson, Robertson Real Estate.
- Technical incident owner: Ben Lane.
- MLS authorization escalation: the applicable Washington County or Iron County MLS contact, plus FBS/Spark support when the incident involves its issued platform credentials or endpoints.
- Privacy/legal escalation: broker-approved legal or privacy contact.

## Incident classes

- Critical: credential exposure, unauthorized MLS data display, confirmed personal-data disclosure, destructive D1 event, or total production compromise.
- High: lead loss, partial-data writes, unauthorized write acceptance, VOW authorization bypass, incorrect county/role activation, or repeated owner-notification failure.
- Medium: degraded search/cache freshness, isolated form failure, failed downstream utility delivery with D1 recovery available, or accessibility regression on a primary journey.
- Low: non-sensitive content defect, cosmetic issue, or isolated analytics/export failure.

## Immediate actions

1. Record the incident in `incident_events` with severity, summary, owner, and detection time.
2. Preserve relevant logs and identifiers. Never paste secret values into an incident record.
3. Contain the affected path:
   - disable the relevant Washington/Iron IDX or VOW activation flag;
   - invoke the MLS kill switch for the affected scope;
   - disable the lead route or delivery utility only when necessary;
   - revoke or rotate exposed credentials;
   - block unapproved origins or abusive traffic.
4. Confirm that the unaffected county and role remain independent and operational.
5. Notify the broker immediately for critical and high incidents.
6. Notify the applicable MLS promptly when its data, credentials, display rights, or consumer authorization may be affected.

## Investigation checklist

- exact release SHA, Pages version, and Worker version;
- first and last known affected timestamps;
- affected routes, county scopes, roles, records, and users;
- D1 transaction, sync-run, notification, and audit identifiers;
- whether raw provider data or prohibited fields were exposed;
- whether contact data was lost, altered, duplicated, or disclosed;
- whether notification delivery failed while the canonical lead remained stored;
- whether the incident crossed preview/production boundaries;
- whether rollback or credential rotation is required.

## Recovery

1. Restore the last known good Pages and Worker versions if code rollback is required.
2. Restore D1 only from a recorded backup/Time Travel point and only after assessing writes that would be lost.
3. Reprocess recoverable notification-outbox jobs after the delivery fault is corrected.
4. Re-run MLS synchronization only for explicitly approved and active scopes.
5. Verify page, API, search, form, notification, and authentication smoke tests.
6. Keep the affected scope disabled until the broker and technical owner approve reactivation.

## Closure

An incident may close only when:

- containment and recovery evidence is recorded;
- affected data and users are identified;
- required MLS, legal, privacy, or consumer notices are complete;
- credential rotation is verified where applicable;
- corrective tests and release gates pass;
- the broker and technical owner approve closure;
- a corrective-action item prevents recurrence.

## Required production evidence

Before launch, record the real phone/email channels for Joel Robertson, Ben Lane, the two MLS organizations, FBS/Spark support, Cloudflare account recovery, and the approved privacy/legal contact. Do not store passwords, access tokens, recovery codes, or secret values in this document.
