import { describe, expect, test } from "bun:test";
import {
  classifyWorkflowLane,
  LeadIdempotencyConflictError,
  storeLeadIntake,
} from "./lead-service";

describe("classifyWorkflowLane", () => {
  test("keeps trusted general intents in their canonical lanes", () => {
    expect(
      classifyWorkflowLane(
        { intent: "general_contact", formVariant: "general" },
        "/api/v1/leads/intake",
      ),
    ).toBe("general_contact");
    expect(
      classifyWorkflowLane(
        { intent: "buyer_active_search", formVariant: "general" },
        "/api/v1/leads/intake",
      ),
    ).toBe("buyer_active_search");
  });

  test("form variant controls special-purpose canonical lanes", () => {
    expect(
      classifyWorkflowLane(
        {
          formVariant: "showing_request",
          intent: "general_contact",
          workflowLane: "nurture",
        },
        "/api/v1/leads/intake",
      ),
    ).toBe("showing_request");
    expect(
      classifyWorkflowLane(
        { formVariant: "property_inquiry", intent: "seller_high_priority" },
        "/api/v1/leads/intake",
      ),
    ).toBe("property_inquiry");
    expect(
      classifyWorkflowLane(
        { formVariant: "valuation", intent: "buyer_early_stage" },
        "/api/v1/leads/intake",
      ),
    ).toBe("valuation");
  });

  test("defaults unknown general intent to general_contact", () => {
    expect(
      classifyWorkflowLane(
        { intent: "unknown_intent", formVariant: "general" },
        "/api/v1/leads/intake",
      ),
    ).toBe("general_contact");
  });
});

type CapturedStatement = {
  sql: string;
  values: unknown[];
};

type ExistingIntake = {
  request_hash: string;
  contact_id: string;
  lead_event_id: string;
  routing_decision_id: string;
  workflow_lane: "general_contact";
};

function createMockLeadEnv(options: {
  contactId?: string;
  existingIntake?: ExistingIntake | null;
  failBatch?: boolean;
} = {}) {
  const statements: CapturedStatement[] = [];
  let batchCalls = 0;

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const statement = {
            sql,
            values,
            async first() {
              return sql.includes("from lead_intake_requests")
                ? options.existingIntake || null
                : null;
            },
          };
          statements.push(statement);
          return statement;
        },
      };
    },
    async batch(input: CapturedStatement[]) {
      batchCalls += 1;
      if (options.failBatch) throw new Error("simulated transaction failure");
      return input.map((_, index) => ({
        success: true,
        results:
          index === input.length - 1
            ? [{ id: options.contactId || "contact-existing" }]
            : [],
      }));
    },
  } as unknown as D1Database;

  return {
    env: {
      DB: db,
      OWNER_NOTIFICATION_EMAIL: "joel@homeinstgeorge.com",
    },
    statements,
    getBatchCalls: () => batchCalls,
  };
}

const baseInput = {
  pathname: "/api/v1/leads/intake",
  requestUrl: "https://homeinstgeorgeutah.com/api/v1/leads/intake",
  referrer: "https://example.com/referrer",
  userAgent: "Unit Test Browser",
  body: {
    submissionId: "9fb4f8d6-f53a-4a06-a54e-084963c0c455",
    name: "Mapper Test Lead",
    email: "mapper-test@example.com",
    phone: "555-010-0111",
    intent: "general_contact",
    workflowLane: "general_contact",
    formVariant: "general",
    message: "Mapper test.",
    consent: true,
    pageUrl: "https://homeinstgeorgeutah.com/contact/",
    attribution: {
      source: "production-smoke-test",
      medium: "manual",
      campaign: "lead-engine-verification",
    },
    device: {
      category: "desktop",
      screenWidth: "1280",
      screenHeight: "800",
    },
  },
};

describe("storeLeadIntake", () => {
  test("writes one contact upsert, event, route, intake record, and owner notification in one D1 batch", async () => {
    const { env, statements, getBatchCalls } = createMockLeadEnv();

    const result = await storeLeadIntake(env, baseInput);

    expect(getBatchCalls()).toBe(1);
    const batchStatements = statements.filter(
      (statement) => !statement.sql.includes("from lead_intake_requests"),
    );
    expect(batchStatements).toHaveLength(8);
    expect(result.contactId).toBe("contact-existing");
    expect(result.duplicate).toBe(false);

    const contactUpsert = batchStatements[0];
    expect(contactUpsert.sql).toContain("on conflict(email_normalized)");
    expect(contactUpsert.sql).toContain(
      "phone = coalesce(excluded.phone, contacts.phone)",
    );

    const attributionInsert = batchStatements.find((statement) =>
      statement.sql.includes("insert into attribution_sessions"),
    );
    expect(attributionInsert?.values[4]).toBe("production-smoke-test");
    expect(attributionInsert?.values[5]).toBe("manual");
    expect(attributionInsert?.values[6]).toBe("lead-engine-verification");

    const leadInsert = batchStatements.find((statement) =>
      statement.sql.includes("insert into lead_events"),
    );
    const storedPayload = JSON.parse(
      String(leadInsert?.values.at(-1)),
    ) as Record<string, unknown>;
    expect(storedPayload).not.toHaveProperty("name");
    expect(storedPayload).not.toHaveProperty("email");
    expect(storedPayload).not.toHaveProperty("phone");
    expect(storedPayload).not.toHaveProperty("message");

    const outboxInsert = batchStatements.find((statement) =>
      statement.sql.includes("insert into notification_outbox"),
    );
    expect(outboxInsert?.values).toContain("joel@homeinstgeorge.com");
    expect(outboxInsert?.values).not.toContain("buyers@homeinstgeorgeutah.com");
  });

  test("returns the existing result without creating duplicate events", async () => {
    const first = createMockLeadEnv();
    const stored = await storeLeadIntake(first.env, baseInput);
    const requestHashStatement = first.statements.find((statement) =>
      statement.sql.includes("insert into lead_intake_requests"),
    );
    const requestHash = String(requestHashStatement?.values[1]);

    const replay = createMockLeadEnv({
      existingIntake: {
        request_hash: requestHash,
        contact_id: stored.contactId,
        lead_event_id: stored.leadEventId,
        routing_decision_id: stored.routingDecisionId,
        workflow_lane: "general_contact",
      },
    });
    const replayed = await storeLeadIntake(replay.env, baseInput);

    expect(replayed.duplicate).toBe(true);
    expect(replayed.leadEventId).toBe(stored.leadEventId);
    expect(replay.getBatchCalls()).toBe(0);
  });

  test("rejects reuse of an idempotency key for different content", async () => {
    const env = createMockLeadEnv({
      existingIntake: {
        request_hash: "different-hash",
        contact_id: "contact-existing",
        lead_event_id: "lead-existing",
        routing_decision_id: "route-existing",
        workflow_lane: "general_contact",
      },
    });

    await expect(storeLeadIntake(env.env, baseInput)).rejects.toBeInstanceOf(
      LeadIdempotencyConflictError,
    );
    expect(env.getBatchCalls()).toBe(0);
  });

  test("binds null phone values so an existing phone is preserved", async () => {
    const { env, statements } = createMockLeadEnv();

    await storeLeadIntake(env, {
      ...baseInput,
      body: {
        ...baseInput.body,
        submissionId: "4ad5d2d1-96ed-45ac-a6f5-30d2fa5f710c",
        email: "existing@example.com",
        phone: "",
      },
    });

    const contactUpsert = statements.find((statement) =>
      statement.sql.includes("insert into contacts"),
    );
    expect(contactUpsert?.values[6]).toBeNull();
    expect(contactUpsert?.values[7]).toBeNull();
  });

  test("uses a single transactional batch so a failure cannot leave later partial writes", async () => {
    const env = createMockLeadEnv({ failBatch: true });
    await expect(storeLeadIntake(env.env, baseInput)).rejects.toThrow(
      "simulated transaction failure",
    );
    expect(env.getBatchCalls()).toBe(1);
  });
});
