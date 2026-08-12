import { describe, expect, test } from "bun:test";
import {
  drainNotificationOutbox,
  type NotificationServiceEnv,
  processNotificationJob,
} from "./notification-service";

type Job = {
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

function createDelivery(
  responseFactory: () => Response = () =>
    new Response(null, {
      status: 202,
      headers: { "x-message-id": "provider-message-1" },
    }),
) {
  const requests: Request[] = [];
  const binding = {
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request =
        input instanceof Request ? input : new Request(input, init);
      requests.push(request.clone());
      return responseFactory();
    },
  } as unknown as Fetcher;

  return { binding, requests };
}

function createEnv(
  job: Job | null,
  queuedIds: string[] = [],
  delivery?: Fetcher,
) {
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              return sql.includes("from notification_outbox n") ? job : null;
            },
            async run() {
              writes.push({ sql, values });
              return { success: true };
            },
            async all() {
              return { results: queuedIds.map((id) => ({ id })) };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  const env: NotificationServiceEnv = {
    DB: db,
    OWNER_NOTIFICATION_EMAIL: "joel@homeinstgeorge.com",
    ...(delivery ? { EMAIL_DELIVERY: delivery } : {}),
  };

  return { env, writes };
}

const job: Job = {
  id: "notify-1",
  lead_event_id: "lead-1",
  contact_id: "contact-1",
  recipient: "joel@homeinstgeorge.com",
  status: "queued",
  attempts: 0,
  full_name: "Test Lead",
  email: "lead@example.com",
  phone: "4355550100",
  message: "Please call.",
  workflow_lane: "general_contact",
  page_url: "https://homeinstgeorgeutah.com/contact/",
  payload_json: "{}",
};

describe("notification outbox", () => {
  test("records a recoverable failure when the service binding is absent", async () => {
    const { env, writes } = createEnv(job);
    const result = await processNotificationJob(env, job.id);

    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(1);
    expect(writes.at(-1)?.sql).toContain("next_attempt_at");
    expect(writes.at(-1)?.values).toContain(
      "Email delivery service binding is not configured.",
    );
  });

  test("never delivers buyer-form notifications to the prohibited buyer mailbox", async () => {
    const { binding } = createDelivery();
    const { env, writes } = createEnv(
      {
        ...job,
        recipient: "buyers@homeinstgeorgeutah.com",
      },
      [],
      binding,
    );
    const result = await processNotificationJob(env, job.id);

    expect(result.status).toBe("dead");
    expect(writes.at(-1)?.values).toContain("Recipient is not approved.");
  });

  test("marks an approved owner notification sent through the service binding", async () => {
    const { binding, requests } = createDelivery();
    const { env, writes } = createEnv(job, [], binding);

    const result = await processNotificationJob(env, job.id);

    expect(result.status).toBe("sent");
    expect(
      writes.some((write) => write.sql.includes("status = 'sending'")),
    ).toBe(true);
    expect(writes.at(-1)?.sql).toContain("status = 'sent'");
    expect(writes.at(-1)?.values).toContain("provider-message-1");

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://email-delivery.internal/internal/owner-lead",
    );
    expect(requests[0]?.method).toBe("POST");

    const payload = await requests[0]?.json();
    expect(payload?.event).toBe("owner.lead.received");
    expect(payload?.to).toBe("joel@homeinstgeorge.com");
    expect(payload?.lead?.workflowLane).toBe("general_contact");
  });

  test("records downstream service failures for retry", async () => {
    const { binding } = createDelivery(
      () => new Response(null, { status: 503 }),
    );
    const { env, writes } = createEnv(job, [], binding);

    const result = await processNotificationJob(env, job.id);

    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(1);
    expect(writes.at(-1)?.values).toContain(
      "Email delivery service returned HTTP 503.",
    );
  });

  test("drains only queued or due failed records", async () => {
    const first = createEnv(job, [job.id]);
    const result = await drainNotificationOutbox(first.env, 10);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
  });
});
