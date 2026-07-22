import { describe, expect, test } from "bun:test";
import { classifyWorkflowLane, storeLeadIntake } from "./lead-service";

describe("classifyWorkflowLane", () => {
  test("keeps explicit general_contact as general_contact", () => {
    expect(
      classifyWorkflowLane(
        { intent: "general_contact" },
        "/api/v1/leads/intake",
      ),
    ).toBe("general_contact");
  });

  test("honors explicit higher-intent workflow lanes", () => {
    expect(
      classifyWorkflowLane(
        { workflowLane: "showing_request", intent: "general_contact" },
        "/api/v1/leads/intake",
      ),
    ).toBe("showing_request");
    expect(
      classifyWorkflowLane(
        { intent: "property_inquiry", listingId: "12345" },
        "/api/v1/leads/intake",
      ),
    ).toBe("property_inquiry");
    expect(
      classifyWorkflowLane({ intent: "valuation" }, "/api/v1/leads/intake"),
    ).toBe("valuation");
  });

  test("defaults unknown intent to general_contact", () => {
    expect(
      classifyWorkflowLane(
        { intent: "unknown_intent" },
        "/api/v1/leads/intake",
      ),
    ).toBe("general_contact");
  });
});

type CapturedStatement = {
  sql: string;
  values: unknown[];
};

function createMockLeadEnv(contactId = "contact-existing") {
  const statements: CapturedStatement[] = [];
  let batchCalls = 0;

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const statement = { sql, values };
          statements.push(statement);
          return statement;
        },
      };
    },
    async batch(input: CapturedStatement[]) {
      batchCalls += 1;
      return input.map((_, index) => ({
        success: true,
        results: index === input.length - 1 ? [{ id: contactId }] : [],
      }));
    },
  } as unknown as D1Database;

  return {
    env: { DB: db },
    statements,
    getBatchCalls: () => batchCalls,
  };
}

describe("storeLeadIntake", () => {
  test("writes contact, context, event, and routing in one D1 batch", async () => {
    const { env, statements, getBatchCalls } = createMockLeadEnv();

    const result = await storeLeadIntake(env, {
      pathname: "/api/v1/leads/intake",
      requestUrl: "https://homeinstgeorgeutah.com/api/v1/leads/intake",
      referrer: "https://example.com/referrer",
      userAgent: "Unit Test Browser",
      body: {
        name: "Mapper Test Lead",
        email: "mapper-test@example.com",
        phone: "555-010-0111",
        intent: "general_contact",
        workflowLane: "general_contact",
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
    });

    expect(getBatchCalls()).toBe(1);
    expect(statements).toHaveLength(6);
    expect(result.contactId).toBe("contact-existing");

    const contactUpsert = statements[0];
    expect(contactUpsert.sql).toContain("on conflict(email_normalized)");
    expect(contactUpsert.sql).toContain(
      "phone = coalesce(excluded.phone, contacts.phone)",
    );

    const attributionInsert = statements.find((statement) =>
      statement.sql.includes("insert into attribution_sessions"),
    );
    expect(attributionInsert?.values[4]).toBe("production-smoke-test");
    expect(attributionInsert?.values[5]).toBe("manual");
    expect(attributionInsert?.values[6]).toBe("lead-engine-verification");
    expect(attributionInsert?.values[7]).toBe("desktop");
    expect(attributionInsert?.values[8]).toBe("1280");
    expect(attributionInsert?.values[9]).toBe("800");

    const leadInsert = statements.find((statement) =>
      statement.sql.includes("insert into lead_events"),
    );
    const storedPayload = JSON.parse(
      String(leadInsert?.values.at(-1)),
    ) as Record<string, unknown>;
    expect(storedPayload).not.toHaveProperty("name");
    expect(storedPayload).not.toHaveProperty("email");
    expect(storedPayload).not.toHaveProperty("phone");
    expect(storedPayload).not.toHaveProperty("message");
  });

  test("binds null phone values so an existing phone is preserved by coalesce", async () => {
    const { env, statements } = createMockLeadEnv();

    await storeLeadIntake(env, {
      pathname: "/api/v1/leads/intake",
      requestUrl: "https://homeinstgeorgeutah.com/api/v1/leads/intake",
      referrer: null,
      userAgent: "Unit Test Browser",
      body: {
        name: "Existing Lead",
        email: "existing@example.com",
        phone: "",
        intent: "general_contact",
      },
    });

    expect(statements[0].values[6]).toBeNull();
    expect(statements[0].values[7]).toBeNull();
  });
});
