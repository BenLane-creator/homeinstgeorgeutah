import { afterEach, describe, expect, test } from "bun:test";
import { APPROVED_POLICY_VERSIONS } from "./mls-scope-service";
import {
  completeVowAuthorization,
  startVowAuthorization,
  VowAuthError,
  type VowAuthEnv,
} from "./vow-auth-service";

type Statement = {
  sql: string;
  values: unknown[];
  run(): Promise<{ success: boolean }>;
  first<T>(): Promise<T | null>;
};

function activeEnv() {
  const statements: Statement[] = [];
  const batches: Statement[][] = [];
  let claim: { id: string; scope_key: "washington-vow"; redirect_after: string } | null =
    null;

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const statement: Statement = {
            sql,
            values,
            async run() {
              return { success: true };
            },
            async first<T>() {
              if (sql.includes("update vow_authorization_attempts") && sql.includes("returning")) {
                return claim as T | null;
              }
              return null;
            },
          };
          statements.push(statement);
          return statement;
        },
      };
    },
    async batch(input: Statement[]) {
      batches.push(input);
      return input.map((_, index) => ({
        success: true,
        results:
          index === input.length - 1
            ? [{ user_account_id: "user-1", contact_id: "contact-1" }]
            : [],
      }));
    },
  } as unknown as D1Database;

  const env = {
    DB: db,
    WASHINGTON_VOW_APPROVAL_STATUS: "approved",
    WASHINGTON_VOW_ENABLED: "true",
    WASHINGTON_VOW_POLICY_VERSION: APPROVED_POLICY_VERSIONS.washington.vow,
    WASHINGTON_VOW_CLIENT_ID: "client-id",
    WASHINGTON_VOW_CLIENT_SECRET: "client-secret",
    WASHINGTON_VOW_AUTHORIZATION_URL: "https://sparkplatform.com/auth/vow",
    WASHINGTON_VOW_TOKEN_URL: "https://sparkapi.com/v1/oauth2/grant",
    WASHINGTON_VOW_CONTACT_URL: "https://sparkapi.com/v1/my/contact",
    WASHINGTON_VOW_MLS_ID: "washington-mls",
    VOW_REDIRECT_URI:
      "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback",
    VOW_STATE_SECRET: "state-secret-state-secret-state-secret",
    VOW_TOKEN_ENCRYPTION_KEY: "encryption-key-encryption-key-encryption-key",
  } satisfies VowAuthEnv;

  return {
    env,
    statements,
    batches,
    setClaim(value: typeof claim) {
      claim = value;
    },
  };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("VOW OAuth2 boundary", () => {
  test("does not start authorization until the county VOW scope is fully active", async () => {
    await expect(
      startVowAuthorization(
        {
          DB: {} as D1Database,
          WASHINGTON_VOW_APPROVAL_STATUS: "pending",
        },
        "washington",
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "VOW_AUTHORIZATION_PENDING",
    });
  });

  test("stores only a hash of opaque signed state and builds the approved redirect", async () => {
    const { env, statements } = activeEnv();
    const location = await startVowAuthorization(
      env,
      "washington",
      "https://evil.example/escape",
    );
    const url = new URL(location);
    const state = url.searchParams.get("state") || "";

    expect(url.origin).toBe("https://sparkplatform.com");
    expect(url.pathname).toBe("/auth/vow");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(env.VOW_REDIRECT_URI);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("mls")).toBe("washington-mls");
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(state.split(".")).toHaveLength(2);

    const insert = statements.find((statement) =>
      statement.sql.includes("insert into vow_authorization_attempts"),
    );
    expect(insert).toBeDefined();
    expect(insert?.values).not.toContain(state);
    expect(insert?.values[3]).toBe("/account/");
  });

  test("exchanges the one-time code server-side, encrypts tokens, and emits only an opaque session", async () => {
    const { env, statements, batches, setClaim } = activeEnv();
    const authorization = new URL(
      await startVowAuthorization(env, "washington", "/account/?tab=saved"),
    );
    const state = authorization.searchParams.get("state") || "";
    setClaim({
      id: "attempt-1",
      scope_key: "washington-vow",
      redirect_after: "/account/?tab=saved",
    });

    const fetchRequests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchRequests.push({ url, init });
      if (url.endsWith("/oauth2/grant")) {
        return Response.json({
          access_token: "raw-access-token",
          refresh_token: "raw-refresh-token",
          expires_in: 86400,
        });
      }
      return Response.json({
        D: {
          Success: true,
          Results: [
            {
              Id: "spark-contact-1",
              DisplayName: "Consumer Example",
              PrimaryEmail: "Consumer@Example.com",
            },
          ],
        },
      });
    }) as typeof fetch;

    const result = await completeVowAuthorization(
      env,
      new URL(
        `https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback?code=authorization-code&state=${encodeURIComponent(state)}`,
      ),
    );

    expect(result.redirectTo).toBe("/account/?tab=saved");
    expect(result.sessionCookie).toContain("__Host-hisgu_session=");
    expect(result.sessionCookie).toContain("HttpOnly");
    expect(result.sessionCookie).toContain("Secure");
    expect(result.sessionCookie).not.toContain("raw-access-token");
    expect(result.sessionCookie).not.toContain("raw-refresh-token");

    expect(fetchRequests).toHaveLength(2);
    const tokenBody = JSON.parse(String(fetchRequests[0]?.init?.body));
    expect(tokenBody).toMatchObject({
      client_id: "client-id",
      client_secret: "client-secret",
      grant_type: "authorization_code",
      code: "authorization-code",
      redirect_uri: env.VOW_REDIRECT_URI,
    });
    expect(
      (fetchRequests[1]?.init?.headers as Record<string, string>).authorization,
    ).toBe("OAuth raw-access-token");

    expect(batches).toHaveLength(1);
    const tokenInsert = batches[0]?.find((statement) =>
      statement.sql.includes("insert into vow_oauth_tokens"),
    );
    const serializedValues = JSON.stringify(tokenInsert?.values || []);
    expect(serializedValues).not.toContain("raw-access-token");
    expect(serializedValues).not.toContain("raw-refresh-token");
    expect(serializedValues).toContain("v1.");

    const claimStatement = statements.find((statement) =>
      statement.sql.includes("returning id, scope_key, redirect_after"),
    );
    expect(claimStatement).toBeDefined();
  });

  test("rejects unsigned callback state before any provider request", async () => {
    const { env } = activeEnv();
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return Response.json({});
    }) as typeof fetch;

    await expect(
      completeVowAuthorization(
        env,
        new URL(
          "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback?code=demo&state=unsigned",
        ),
      ),
    ).rejects.toBeInstanceOf(VowAuthError);
    expect(fetchCalled).toBe(false);
  });
});
