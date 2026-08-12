import { describe, expect, test } from "bun:test";
import worker, {
  CANONICAL_WORKFLOW_LANES,
  type Env,
  type WorkflowLane,
} from "./index";

type BoundStatement = {
  sql: string;
  values: unknown[];
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
};

function createDb() {
  const statements: BoundStatement[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const statement: BoundStatement = {
            sql,
            values,
            async first<T = unknown>() {
              return null as T | null;
            },
            async run<T = unknown>() {
              return { success: true } as D1Result<T>;
            },
          };
          statements.push(statement);
          return statement;
        },
      };
    },
    async batch<T = unknown>(_batch: D1PreparedStatement[]) {
      return _batch.map(() => ({ success: true }) as D1Result<T>);
    },
  } as unknown as D1Database;

  return { db, statements };
}

function createSendEmail(messageId = "cf-message-1") {
  const sent: Array<Record<string, unknown>> = [];
  const binding = {
    async send(message: Record<string, unknown>) {
      sent.push(message);
      return { messageId };
    },
  } as unknown as SendEmail;
  return { binding, sent };
}

const lanes: WorkflowLane[] = [...CANONICAL_WORKFLOW_LANES];

function ownerPayload(
  workflowLane: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    event: "owner.lead.received",
    to: "joel@homeinstgeorge.com",
    subject: `New ${workflowLane} website request`,
    lead: {
      eventId: `lead-${workflowLane}`,
      contactId: `contact-${workflowLane}`,
      name: "Test Lead",
      email: "lead@example.com",
      phone: "4355550100",
      message: "Please contact me.",
      workflowLane,
      pageUrl: "https://homeinstgeorgeutah.com/contact/",
      context: {},
    },
    ...overrides,
  };
}

function internalRequest(body: unknown, method = "POST") {
  return new Request("https://email-delivery.internal/internal/owner-lead", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

describe("internal owner lead delivery", () => {
  test("rejects methods other than POST", async () => {
    const response = await worker.fetch(
      internalRequest(null, "GET"),
      {} as Env,
    );
    expect(response.status).toBe(405);
  });

  test("rejects a non-owner recipient", async () => {
    const { binding, sent } = createSendEmail();
    const response = await worker.fetch(
      internalRequest(
        ownerPayload("general_contact", {
          to: "buyers@homeinstgeorgeutah.com",
        }),
      ),
      {
        OWNER_EMAIL: binding,
        FORWARD_TO: "joel@homeinstgeorge.com",
      } as Env,
    );

    expect(response.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  for (const lane of lanes) {
    test(`delivers ${lane} through the same owner-only contract`, async () => {
      const { binding, sent } = createSendEmail(`cf-${lane}`);
      const response = await worker.fetch(internalRequest(ownerPayload(lane)), {
        OWNER_EMAIL: binding,
        FORWARD_TO: "joel@homeinstgeorge.com",
        AUTO_REPLY_FROM: "contact@homeinstgeorgeutah.com",
      } as Env);

      expect(response.status).toBe(202);
      expect(response.headers.get("x-message-id")).toBe(`cf-${lane}`);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe("joel@homeinstgeorge.com");
      expect(sent[0]?.from).toBe("contact@homeinstgeorgeutah.com");
    });
  }

  test("keeps undeclared future lanes fail-closed", async () => {
    const { binding, sent } = createSendEmail();
    const response = await worker.fetch(
      internalRequest(ownerPayload("future_market_advisor")),
      {
        OWNER_EMAIL: binding,
        FORWARD_TO: "joel@homeinstgeorge.com",
      } as Env,
    );

    expect(response.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  test("accepts an explicitly activated future workflow lane", async () => {
    const { binding, sent } = createSendEmail("cf-future-lane");
    const response = await worker.fetch(
      internalRequest(ownerPayload("future_market_advisor")),
      {
        OWNER_EMAIL: binding,
        FORWARD_TO: "joel@homeinstgeorge.com",
        ADDITIONAL_WORKFLOW_LANES: "future_market_advisor",
      } as Env,
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("x-message-id")).toBe("cf-future-lane");
    expect(sent).toHaveLength(1);
  });

  test("escapes lead supplied HTML in the owner message", async () => {
    const { binding, sent } = createSendEmail();
    const payload = ownerPayload("general_contact");
    payload.lead.name = '<img src=x onerror="alert(1)">';
    payload.lead.message = "<script>alert(1)</script>";

    const response = await worker.fetch(internalRequest(payload), {
      OWNER_EMAIL: binding,
      FORWARD_TO: "joel@homeinstgeorge.com",
    } as Env);

    expect(response.status).toBe(202);
    const html = String(sent[0]?.html || "");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("existing inbound email behavior", () => {
  test("preserves seller capture, forward, and auto-reply", async () => {
    const { db, statements } = createDb();
    const { binding: email, sent } = createSendEmail("auto-reply-1");
    const forwarded: string[] = [];

    const headers = new Headers({
      from: "Seller Lead <seller@example.com>",
      subject: "I want to sell",
      "message-id": "<seller-message-1@example.com>",
    });
    const raw = new Blob([
      "Subject: I want to sell\r\n\r\nPlease call me.",
    ]).stream();
    const message = {
      from: "seller@example.com",
      to: "sellers@homeinstgeorgeutah.com",
      headers,
      raw,
      async forward(recipient: string) {
        forwarded.push(recipient);
        return { messageId: "forward-1" };
      },
    } as unknown as ForwardableEmailMessage;

    await worker.email(
      message,
      {
        DB: db,
        EMAIL: email,
        FORWARD_TO: "joel@homeinstgeorge.com",
        AUTO_REPLY_FROM: "contact@homeinstgeorgeutah.com",
        AUTO_REPLY_ENABLED: "true",
      },
      {} as ExecutionContext,
    );

    expect(forwarded).toEqual(["joel@homeinstgeorge.com"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("seller@example.com");
    expect(
      statements.some((statement) =>
        statement.values.includes("seller_high_priority"),
      ),
    ).toBe(true);
  });
});
