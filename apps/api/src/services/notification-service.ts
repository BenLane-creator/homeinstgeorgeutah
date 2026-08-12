export interface NotificationServiceEnv {
  DB: D1Database;
  OWNER_NOTIFICATION_EMAIL?: string;
  EMAIL_DELIVERY?: Fetcher;
}

type NotificationJob = {
  id: string;
  lead_event_id: string;
  contact_id: string;
  recipient: string;
  status: "queued" | "failed";
  attempts: number;
  full_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  workflow_lane: string;
  page_url: string | null;
  payload_json: string;
};

export type NotificationDispatchResult = {
  jobId: string;
  status: "sent" | "failed" | "dead" | "skipped";
  attempts: number;
  error?: string;
};

const INTERNAL_EMAIL_DELIVERY_URL =
  "https://email-delivery.internal/internal/owner-lead";

function normalizedEmail(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function approvedRecipient(env: NotificationServiceEnv, recipient: string) {
  const configured = normalizedEmail(
    env.OWNER_NOTIFICATION_EMAIL || "joel@homeinstgeorge.com",
  );
  const requested = normalizedEmail(recipient);
  return (
    requested === configured && requested !== "buyers@homeinstgeorgeutah.com"
  );
}

async function markFailed(
  env: NotificationServiceEnv,
  job: NotificationJob,
  error: string,
): Promise<NotificationDispatchResult> {
  const attempts = job.attempts + 1;
  const dead = attempts >= 5;
  const delayMinutes = Math.min(60, 5 * 2 ** Math.max(0, attempts - 1));

  await env.DB.prepare(
    `update notification_outbox
        set status = ?, attempts = ?, last_attempt_at = CURRENT_TIMESTAMP,
            next_attempt_at = case when ? = 'dead' then null else datetime('now', ?) end,
            last_error = ?, updated_at = CURRENT_TIMESTAMP
      where id = ?`,
  )
    .bind(
      dead ? "dead" : "failed",
      attempts,
      dead ? "dead" : "failed",
      `+${delayMinutes} minutes`,
      error.slice(0, 1_000),
      job.id,
    )
    .run();

  return {
    jobId: job.id,
    status: dead ? "dead" : "failed",
    attempts,
    error,
  };
}

export async function processNotificationJob(
  env: NotificationServiceEnv,
  jobId: string,
): Promise<NotificationDispatchResult> {
  const job = await env.DB.prepare(
    `select n.id, n.lead_event_id, n.contact_id, n.recipient, n.status,
            n.attempts, c.full_name, c.email, c.phone, le.message,
            le.workflow_lane, le.page_url, n.payload_json
       from notification_outbox n
       join contacts c on c.id = n.contact_id
       join lead_events le on le.id = n.lead_event_id
      where n.id = ? and n.status in ('queued','failed')
      limit 1`,
  )
    .bind(jobId)
    .first<NotificationJob>();

  if (!job) {
    return { jobId, status: "skipped", attempts: 0 };
  }

  if (!approvedRecipient(env, job.recipient)) {
    return markFailed(
      env,
      { ...job, attempts: 4 },
      "Recipient is not approved.",
    );
  }

  if (!env.EMAIL_DELIVERY) {
    return markFailed(
      env,
      job,
      "Email delivery service binding is not configured.",
    );
  }

  await env.DB.prepare(
    `update notification_outbox
        set status = 'sending', last_attempt_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      where id = ? and status in ('queued','failed')`,
  )
    .bind(job.id)
    .run();

  try {
    const response = await env.EMAIL_DELIVERY.fetch(
      new Request(INTERNAL_EMAIL_DELIVERY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          event: "owner.lead.received",
          to: job.recipient,
          subject: `New ${job.workflow_lane.replaceAll("_", " ")} website request`,
          lead: {
            eventId: job.lead_event_id,
            contactId: job.contact_id,
            name: job.full_name,
            email: job.email,
            phone: job.phone,
            message: job.message,
            workflowLane: job.workflow_lane,
            pageUrl: job.page_url,
            context: JSON.parse(job.payload_json || "{}"),
          },
        }),
        signal: AbortSignal.timeout(8_000),
      }),
    );

    if (!response.ok) {
      return markFailed(
        env,
        job,
        `Email delivery service returned HTTP ${response.status}.`,
      );
    }

    const attempts = job.attempts + 1;
    await env.DB.prepare(
      `update notification_outbox
          set status = 'sent', attempts = ?, delivered_at = CURRENT_TIMESTAMP,
              provider_message_id = ?, next_attempt_at = null, last_error = null,
              updated_at = CURRENT_TIMESTAMP
        where id = ?`,
    )
      .bind(
        attempts,
        response.headers.get("x-message-id") ||
          response.headers.get("x-request-id") ||
          null,
        job.id,
      )
      .run();

    return { jobId: job.id, status: "sent", attempts };
  } catch (error) {
    return markFailed(
      env,
      job,
      error instanceof Error ? error.message : "Email delivery failed.",
    );
  }
}

export async function drainNotificationOutbox(
  env: NotificationServiceEnv,
  limit = 10,
) {
  const boundedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
  const rows = await env.DB.prepare(
    `select id from notification_outbox
      where status = 'queued'
         or (status = 'failed' and (next_attempt_at is null or next_attempt_at <= CURRENT_TIMESTAMP))
      order by created_at asc
      limit ?`,
  )
    .bind(boundedLimit)
    .all<{ id: string }>();

  const results: NotificationDispatchResult[] = [];
  for (const row of rows.results || []) {
    results.push(await processNotificationJob(env, row.id));
  }

  return {
    processed: results.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    dead: results.filter((result) => result.status === "dead").length,
    results,
  };
}
