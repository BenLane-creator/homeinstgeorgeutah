# Owner Notification Delivery and Recovery

## Operating rule

A lead is accepted only after the canonical D1 transaction stores the contact, lead event, routing decision, idempotency record, and notification-outbox job. Email delivery occurs after that transaction. A delivery failure must never erase or roll back a valid lead.

The only automated lead-notification recipient is the approved owner address configured by `OWNER_NOTIFICATION_EMAIL`. The application explicitly prohibits automated delivery to `buyers@homeinstgeorgeutah.com`.

## Delivery contract

- Canonical state: `notification_outbox` in D1.
- Delivery utility: replaceable HTTPS endpoint configured by `EMAIL_DELIVERY_WEBHOOK_URL`.
- Authentication: server-side `EMAIL_DELIVERY_TOKEN` secret when required.
- Immediate attempt: Worker `ExecutionContext.waitUntil` after a new lead transaction.
- Recovery: five-minute scheduled drain plus protected manual drain route.
- Maximum automated attempts: five.
- Backoff: 5, 10, 20, 40, then 60 minutes.
- Terminal status: `dead`, requiring a documented manual decision.

## Manual recovery

Protected route:

```text
POST /api/internal/notifications/drain
Authorization: Bearer <INTERNAL_JOB_TOKEN>
```

The route may process only queued jobs and failed jobs whose retry time has arrived. It must not create a second lead event or routing decision.

## Verification after a delivery fault

1. Confirm the lead exists in `contacts`, `lead_events`, and `routing_decisions`.
2. Confirm the outbox record references the same contact and lead event.
3. Correct the delivery endpoint, token, sender authorization, or approved recipient configuration.
4. Run the protected drain operation or wait for the scheduled drain.
5. Verify `status='sent'`, `delivered_at`, attempt count, and provider message identifier.
6. If delivery remains impossible, contact Joel directly using the canonical D1 record and document the manual handling before marking the job resolved or retaining it as `dead`.

## Launch proof

A controlled production test must demonstrate exactly one approved owner notification for one controlled lead submission. The evidence must include the lead-event ID, notification-outbox ID, delivery timestamp, recipient, and provider message ID without exposing secret values.
