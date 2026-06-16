import { describe, expect, test } from "bun:test";

import worker from "./index";

function createDbStub() {
  return {
    batch: async () => [],
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        run: async () => ({ success: true }),
      }),
    }),
  };
}

const env = {
  API_WRITE_ORIGINS:
    "https://homeinstgeorgeutah.com,https://www.homeinstgeorgeutah.com,http://localhost:4321",
  DB: createDbStub(),
};

describe("lead write security headers", () => {
  test("returns origin-aware CORS and no-store for preflight", async () => {
    const response = await worker.fetch(
      new Request("https://homeinstgeorgeutah.com/api/v1/leads/intake", {
        method: "OPTIONS",
        headers: {
          origin: "https://www.homeinstgeorgeutah.com",
        },
      }),
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://www.homeinstgeorgeutah.com",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  test("falls back to first configured origin for unapproved write origin", async () => {
    const response = await worker.fetch(
      new Request("https://homeinstgeorgeutah.com/api/v1/leads/intake", {
        method: "OPTIONS",
        headers: {
          origin: "https://example.com",
        },
      }),
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://homeinstgeorgeutah.com",
    );
  });

  test("returns no-store on invalid write payloads", async () => {
    const response = await worker.fetch(
      new Request("https://homeinstgeorgeutah.com/api/v1/leads/intake", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://homeinstgeorgeutah.com",
          "user-agent": "HomeInStGeorgeUtah test runner",
        },
        body: JSON.stringify({
          intent: "general_contact",
          name: "No Consent",
          email: "no-consent@example.com",
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://homeinstgeorgeutah.com",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
