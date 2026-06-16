import { describe, expect, test } from "bun:test";
import { classifyWorkflowLane, storeLeadIntake } from "./lead-service";

describe("classifyWorkflowLane", () => {
  test("keeps explicit general_contact as general_contact", () => {
    expect(
      classifyWorkflowLane(
        {
          intent: "general_contact",
        },
        "/api/v1/leads/intake",
      ),
    ).toBe("general_contact");
  });

  test("does not infer buyer_active_search from generic HomeInStGeorgeUtah context", () => {
    expect(
      classifyWorkflowLane(
        {
          intent: "general_contact",
          pageUrl: "https://homeinstgeorgeutah.com/contact",
          message: "I have a question about homes.",
        },
        "/api/v1/leads/intake",
      ),
    ).toBe("general_contact");
  });

  test("honors explicit higher-intent workflow lane", () => {
    expect(
      classifyWorkflowLane(
        {
          workflowLane: "showing_request",
          intent: "general_contact",
        },
        "/api/v1/leads/intake",
      ),
    ).toBe("showing_request");
  });

  test("routes valuation intent to valuation", () => {
    expect(
      classifyWorkflowLane(
        {
          intent: "valuation",
        },
        "/api/v1/leads/intake",
      ),
    ).toBe("valuation");
  });

  test("routes property inquiry intent to property_inquiry", () => {
    expect(
      classifyWorkflowLane(
        {
          intent: "property_inquiry",
          listingId: "12345",
        },
        "/api/v1/leads/intake",
      ),
    ).toBe("property_inquiry");
  });

  test("routes relocation intent to relocation", () => {
    expect(
      classifyWorkflowLane(
        {
          intent: "relocation",
        },
        "/api/v1/leads/intake",
      ),
    ).toBe("relocation");
  });

  test("defaults unknown intent to general_contact", () => {
    expect(
      classifyWorkflowLane(
        {
          intent: "unknown_intent",
        },
        "/api/v1/leads/intake",
      ),
    ).toBe("general_contact");
  });
});

type CapturedStatement = {
  sql: string;
  values: unknown[];
};

function createMockLeadEnv() {
  const statements: CapturedStatement[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ sql, values });

          return {
            first: async <T>() => null as T | null,
            run: async () => ({ success: true }),
          };
        },
      };
    },
    batch: async () => [],
  } as unknown as D1Database;

  return {
    env: { DB: db },
    statements,
  };
}

describe("storeLeadIntake", () => {
  test("maps nested attribution and device context into attribution session", async () => {
    const { env, statements } = createMockLeadEnv();

    await storeLeadIntake(env, {
      pathname: "/api/v1/leads/intake",
      requestUrl: "https://homeinstgeorgeutah.com/api/v1/leads/intake",
      referrer: "https://example.com/referrer",
      userAgent: "Unit Test Browser",
      body: {
        name: "Mapper Test Lead",
        email: "mapper-test@example.com",
        phone: "555-010-0111",
        intent: "general_contact",
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

    const attributionInsert = statements.find((statement) =>
      statement.sql.includes("insert into attribution_sessions"),
    );

    expect(attributionInsert).toBeDefined();
    expect(attributionInsert?.values[4]).toBe("production-smoke-test");
    expect(attributionInsert?.values[5]).toBe("manual");
    expect(attributionInsert?.values[6]).toBe("lead-engine-verification");
    expect(attributionInsert?.values[7]).toBe("desktop");
    expect(attributionInsert?.values[8]).toBe("1280");
    expect(attributionInsert?.values[9]).toBe("800");
  });
});
