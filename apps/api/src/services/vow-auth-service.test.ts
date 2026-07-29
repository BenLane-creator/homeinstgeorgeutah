import { describe, expect, test } from "bun:test";
import { APPROVED_POLICY_VERSIONS } from "./mls-scope-service";
import {
  beginVowAuthorization,
  VowAuthError,
  type VowAuthEnv,
} from "./vow-auth-service";

type Statement = { sql: string; values: unknown[] };

function mockEnv(overrides: Partial<VowAuthEnv> = {}) {
  const statements: Statement[] = [];
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
    async batch(input: Statement[]) {
      return input.map(() => ({ success: true, results: [] }));
    },
  } as unknown as D1Database;

  return {
    env: {
      DB: db,
      WASHINGTON_VOW_APPROVAL_STATUS: "approved",
      WASHINGTON_VOW_ENABLED: "true",
      WASHINGTON_VOW_POLICY_VERSION:
        APPROVED_POLICY_VERSIONS.washington.vow,
      WASHINGTON_VOW_CLIENT_ID: "client-id",
      WASHINGTON_VOW_CLIENT_SECRET: "client-secret",
      WASHINGTON_VOW_AUTHORIZATION_URL: "https://id.example.com/authorize",
      WASHINGTON_VOW_TOKEN_URL: "https://id.example.com/token",
      WASHINGTON_VOW_ISSUER: "https://id.example.com",
      WASHINGTON_VOW_JWKS_URL: "https://id.example.com/jwks",
      WASHINGTON_VOW_MLS_ID: "washington-feed",
      VOW_REDIRECT_URI:
        "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback",
      VOW_STATE_SECRET: "state-secret",
      VOW_TOKEN_ENCRYPTION_SECRET: "token-secret",
      ...overrides,
    } as VowAuthEnv,
    statements,
  };
}

describe("beginVowAuthorization", () => {
  test("fails closed when the requested county scope is inactive", async () => {
    const { env } = mockEnv({ WASHINGTON_VOW_ENABLED: "false" });
    try {
      await beginVowAuthorization(env, "washington", "/account/");
      throw new Error("Expected authorization to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(VowAuthError);
      expect((error as VowAuthError).code).toBe("VOW_SCOPE_INACTIVE");
    }
  });

  test("creates a signed, PKCE-bound, county-specific authorization request", async () => {
    const { env, statements } = mockEnv();
    const result = await beginVowAuthorization(
      env,
      "washington",
      "https://evil.example/redirect",
    );
    const url = new URL(result);

    expect(url.origin).toBe("https://id.example.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")?.length).toBeGreaterThan(20);
    expect(url.searchParams.get("state")?.split(".")).toHaveLength(2);
    expect(url.searchParams.get("nonce")?.length).toBeGreaterThan(20);
    expect(url.searchParams.get("mls")).toBe("washington-feed");

    const attempt = statements.find((statement) =>
      statement.sql.includes("insert into vow_authorization_attempts"),
    );
    expect(attempt).toBeDefined();
    expect(attempt?.values[1]).toBe("washington-vow");
    expect(attempt?.values[4]).toBe("/account/");
    expect(String(attempt?.values[6])).toStartWith("v1.");
  });
});
