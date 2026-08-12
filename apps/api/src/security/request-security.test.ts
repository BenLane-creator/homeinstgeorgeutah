import { describe, expect, test } from "bun:test";
import {
  approvedWriteOrigin,
  enforceLeadRateLimit,
  readJsonBody,
  validateAndMinimizeLeadBody,
  verifyTurnstile,
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

describe("Turnstile siteverify", () => {
  const request = new Request(
    "https://homeinstgeorgeutah.com/api/v1/leads/intake",
    {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.10" },
    },
  );
  const env = {
    APP_ENV: "production",
    TURNSTILE_SECRET_KEY: "test-secret",
    TURNSTILE_HOSTNAMES: "homeinstgeorgeutah.com,www.homeinstgeorgeutah.com",
    TURNSTILE_EXPECTED_ACTION: "turnstile-spin-v2",
  };

  test("posts the token and client IP to canonical siteverify", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedBody = "";

    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = String(init?.body || "");
      return new Response(
        JSON.stringify({
          success: true,
          action: "turnstile-spin-v2",
          hostname: "homeinstgeorgeutah.com",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    try {
      await verifyTurnstile(request, env, { turnstileToken: "token-value" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(capturedUrl).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    const payload = new URLSearchParams(capturedBody);
    expect(payload.get("secret")).toBe("test-secret");
    expect(payload.get("response")).toBe("token-value");
    expect(payload.get("remoteip")).toBe("203.0.113.10");
  });

  test("rejects a successful response with the wrong action", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          action: "different-action",
          hostname: "homeinstgeorgeutah.com",
        }),
        { status: 200 },
      );

    try {
      await expect(
        verifyTurnstile(request, env, { turnstileToken: "token-value" }),
      ).rejects.toMatchObject({ status: 400, code: "TURNSTILE_FAILED" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects a successful response from an unapproved hostname", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          action: "turnstile-spin-v2",
          hostname: "preview.example.com",
        }),
        { status: 200 },
      );

    try {
      await expect(
        verifyTurnstile(request, env, { turnstileToken: "token-value" }),
      ).rejects.toMatchObject({ status: 400, code: "TURNSTILE_FAILED" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("fails closed when hostname configuration is absent", async () => {
    await expect(
      verifyTurnstile(
        request,
        {
          APP_ENV: "production",
          TURNSTILE_SECRET_KEY: "test-secret",
          TURNSTILE_EXPECTED_ACTION: "turnstile-spin-v2",
        },
        { turnstileToken: "token-value" },
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "LEAD_PROTECTION_NOT_CONFIGURED",
    });
  });

  test("fails closed when siteverify is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };

    try {
      await expect(
        verifyTurnstile(request, env, { turnstileToken: "token-value" }),
      ).rejects.toMatchObject({ status: 502, code: "TURNSTILE_UNAVAILABLE" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
