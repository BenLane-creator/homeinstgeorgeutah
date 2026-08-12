import { describe, expect, test } from "bun:test";
import { type Env, handleRequest } from "./index";

function env(overrides: Partial<Env> = {}) {
  return {
    APP_ENV: "production",
    API_WRITE_ORIGINS: "https://homeinstgeorgeutah.com",
    OWNER_NOTIFICATION_EMAIL: "joel@homeinstgeorge.com",
    DB: {} as D1Database,
    WASHINGTON_IDX_APPROVAL_STATUS: "pending",
    WASHINGTON_VOW_APPROVAL_STATUS: "pending",
    IRON_IDX_APPROVAL_STATUS: "pending",
    IRON_VOW_APPROVAL_STATUS: "pending",
    ...overrides,
  } as Env;
}

describe("API routing", () => {
  test("returns JSON health and JSON unknown-route responses", async () => {
    const health = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/health"),
      env(),
    );
    expect(health.status).toBe(200);
    expect(health.headers.get("content-type")).toContain("application/json");
    expect((await health.json()) as Record<string, unknown>).toMatchObject({
      data: { readModel: "canonical-d1-cache" },
    });

    const missing = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/not-a-route"),
      env(),
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()) as { ok: boolean }).toMatchObject({
      ok: false,
    });
  });

  test("reports all four pending MLS approval scopes independently", async () => {
    const response = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/mls-status"),
      env(),
    );
    const payload = (await response.json()) as {
      data: {
        active: boolean;
        readModel: string;
        scopes: Array<{ key: string; approvalStatus: string; active: boolean }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data.active).toBe(false);
    expect(payload.data.readModel).toBe("canonical-d1-cache");
    expect(payload.data.scopes).toHaveLength(4);
    expect(payload.data.scopes.map((scope) => scope.key)).toEqual([
      "washington-idx",
      "washington-vow",
      "iron-idx",
      "iron-vow",
    ]);
    expect(
      payload.data.scopes.every(
        (scope) => scope.approvalStatus === "pending" && !scope.active,
      ),
    ).toBe(true);
  });

  test("keeps county search disabled when only provider credentials exist", async () => {
    const response = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/search?county=iron"),
      env({
        IRON_IDX_API_BASE_URL: "https://example.com/reso",
        IRON_IDX_ACCESS_TOKEN: "secret",
      }),
    );
    const payload = (await response.json()) as {
      data: { mode: string; listings: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(payload.data.mode).toBe("disabled");
    expect(payload.data.listings).toEqual([]);
  });

  test("keeps VOW authorization start fail-closed while approvals are pending", async () => {
    const response = await handleRequest(
      new Request(
        "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/start?county=washington",
      ),
      env(),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.error.code).toBe("VOW_AUTHORIZATION_PENDING");
  });

  test("rejects callback responses that do not contain a signed one-time state", async () => {
    const response = await handleRequest(
      new Request(
        "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback?code=demo",
      ),
      env(),
    );
    const payload = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.error.code).toBe("VOW_STATE_INVALID");
  });

  test("reports an unauthenticated session without touching D1 when no cookie exists", async () => {
    const response = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/v1/session"),
      env(),
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toMatchObject({
      data: { authenticated: false, account: null },
    });
  });

  test("does not expose public listing-detail routes", async () => {
    const response = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/listings/123"),
      env(),
    );
    expect(response.status).toBe(404);
  });

  test("protects internal sync and notification recovery routes", async () => {
    for (const route of [
      "/api/internal/mls/sync",
      "/api/internal/notifications/drain",
    ]) {
      const response = await handleRequest(
        new Request(`https://homeinstgeorgeutah.com${route}`, {
          method: "POST",
        }),
        env({ INTERNAL_JOB_TOKEN: "expected" }),
      );
      expect(response.status).toBe(401);
    }
  });
});

describe("lead intake boundary", () => {
  test("rejects unapproved and missing origins without CORS reflection", async () => {
    const headerSets: Record<string, string>[] = [
      { origin: "https://evil.example", "content-type": "application/json" },
      { "content-type": "application/json" },
    ];

    for (const headers of headerSets) {
      const response = await handleRequest(
        new Request("https://homeinstgeorgeutah.com/api/v1/leads/intake", {
          method: "POST",
          headers,
          body: "{}",
        }),
        env(),
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  test("answers preflight only for an approved origin", async () => {
    const response = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/v1/leads/intake", {
        method: "OPTIONS",
        headers: { origin: "https://homeinstgeorgeutah.com" },
      }),
      env(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://homeinstgeorgeutah.com",
    );
  });

  test("fails closed when production abuse protection is unconfigured", async () => {
    const response = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/v1/leads/intake", {
        method: "POST",
        headers: {
          origin: "https://homeinstgeorgeutah.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Lead",
          email: "test@example.com",
          consent: true,
        }),
      }),
      env(),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("requires a valid idempotency key before writing a lead", async () => {
    const response = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/v1/leads/intake", {
        method: "POST",
        headers: {
          origin: "https://homeinstgeorgeutah.com",
          "content-type": "application/json",
          "cf-connecting-ip": "192.0.2.1",
        },
        body: JSON.stringify({
          name: "Test Lead",
          email: "test@example.com",
          consent: true,
          intent: "general_contact",
          workflowLane: "general_contact",
        }),
      }),
      env({
        APP_ENV: "development",
        LEAD_RATE_LIMITER: {
          async limit() {
            return { success: true };
          },
        },
      }),
    );

    const payload = (await response.json()) as { error: { code: string } };
    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});
