import { describe, expect, test } from "bun:test";
import { handleRequest, type Env } from "./index";

function env(overrides: Partial<Env> = {}) {
  return {
    APP_ENV: "production",
    API_WRITE_ORIGINS: "https://homeinstgeorgeutah.com",
    DB: {} as D1Database,
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

    const missing = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/not-a-route"),
      env(),
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()) as { ok: boolean }).toMatchObject({
      ok: false,
    });
  });

  test("keeps search disabled when only provider credentials exist", async () => {
    const response = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/search"),
      env({
        SPARK_API_BASE_URL: "https://example.com/reso",
        SPARK_ACCESS_TOKEN: "secret",
      }),
    );
    const payload = (await response.json()) as {
      data: { mode: string; listings: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(payload.data.mode).toBe("disabled");
    expect(payload.data.listings).toEqual([]);
  });

  test("does not expose public listing-detail routes", async () => {
    const response = await handleRequest(
      new Request("https://homeinstgeorgeutah.com/api/listings/123"),
      env(),
    );
    expect(response.status).toBe(404);
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
});
