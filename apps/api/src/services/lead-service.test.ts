import { describe, expect, test } from "bun:test";
import { classifyWorkflowLane } from "./lead-service";

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
