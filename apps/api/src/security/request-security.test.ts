import { describe, expect, test } from "bun:test";
import {
  approvedWriteOrigin,
  enforceLeadRateLimit,
  readJsonBody,
  validateAndMinimizeLeadBody,
} from "./request-security";

describe("write origin policy", () => {
  const env = {
    API_WRITE_ORIGINS: "https://homeinstgeorgeutah.com,http://localhost:4321",
  };

  test("accepts only exact configured origins", () => {
    expect(
      approvedWriteOrigin(
        new Request("https://example.com", {
          headers: { origin: "https://homeinstgeorgeutah.com" },
        }),
        env,
      ),
    ).toBe("https://homeinstgeorgeutah.com");
    expect(
      approvedWriteOrigin(
        new Request("https://example.com", {
          headers: { origin: "https://evil.example" },
        }),
        env,
      ),
    ).toBeNull();
    expect(
      approvedWriteOrigin(new Request("https://example.com"), env),
    ).toBeNull();
  });
});

describe("lead request protection", () => {
  test("fails closed in production when the rate limiter is missing", async () => {
    await expect(
      enforceLeadRateLimit(new Request("https://example.com"), {
        APP_ENV: "production",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  test("rejects non-JSON and oversized bodies", async () => {
    await expect(
      readJsonBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "hello",
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });

    await expect(
      readJsonBody(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "x".repeat(25_000) }),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });

  test("minimizes accepted data and excludes Turnstile tokens", () => {
    const result = validateAndMinimizeLeadBody({
      name: "Test Lead",
      email: "TEST@EXAMPLE.COM",
      consent: true,
      intent: "general_contact",
      workflowLane: "general_contact",
      pageUrl: "https://homeinstgeorgeutah.com/contact/",
      turnstileToken: "do-not-store",
      unexpected: "do-not-store",
      details: { movingFrom: "Colorado", unexpected: "do-not-store" },
    });

    expect(result.email).toBe("test@example.com");
    expect(result).not.toHaveProperty("turnstileToken");
    expect(result).not.toHaveProperty("unexpected");
    expect(result.details).toEqual({ movingFrom: "Colorado" });
  });
});
