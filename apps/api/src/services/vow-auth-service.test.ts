import { afterEach, describe, expect, test } from "bun:test";
import { sha256Hex } from "../security/oidc";
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

type Claim = {
  id: string;
  scope_key: "washington-vow";
  nonce_hash: string;
  redirect_after: string;
};

function activeEnv() {
  const statements: Statement[] = [];
  const batches: Statement[][] = [];
  let claim: Claim | null = null;

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
              if (
                sql.includes("update vow_authorization_attempts") &&
                sql.includes("returning")
              ) {
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
    WASHINGTON_VOW_AUTHORIZATION_URL:
      "https://sparkplatform.com/openid/authorize",
    WASHINGTON_VOW_TOKEN_URL: "https://sparkplatform.com/openid/token",
    WASHINGTON_VOW_CONTACT_URL:
      "https://replication.sparkapi.com/v1/my/account",
    WASHINGTON_VOW_ISSUER: "https://sparkplatform.com",
    WASHINGTON_VOW_JWKS_URL: "https://sparkplatform.com/openid/jwks",
    WASHINGTON_VOW_SCOPES: "openid",
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
    setClaim(value: Claim | null) {
      claim = value;
    },
  };
}

function base64Url(value: Uint8Array | string) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signedIdToken(nonce: string) {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey(
    "jwk",
    keyPair.publicKey,
  )) as JsonWebKey & { kid?: string; use?: string; alg?: string };
  publicJwk.kid = "test-key";
  publicJwk.use = "sig";
  publicJwk.alg = "RS256";

  const header = base64Url(
    JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" }),
  );
  const claims = base64Url(
    JSON.stringify({
      iss: "https://sparkplatform.com",
      sub: "spark-user-1",
      aud: "client-id",
      exp: Math.floor(Date.now() / 1_000) + 600,
      iat: Math.floor(Date.now() / 1_000) - 5,
      nonce,
    }),
  );
  const input = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyPair.privateKey,
      new TextEncoder().encode(input),
    ),
  );
  return { token: `${input}.${base64Url(signature)}`, publicJwk };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("VOW OIDC boundary", () => {
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

  test("stores state and nonce hashes and builds the approved OIDC redirect", async () => {
    const { env, statements } = activeEnv();
    const location = await startVowAuthorization(
      env,
      "washington",
      "https://evil.example/escape",
    );
    const url = new URL(location);
    const state = url.searchParams.get("state") || "";
    const nonce = url.searchParams.get("nonce") || "";

    expect(url.origin).toBe("https://sparkplatform.com");
    expect(url.pathname).toBe("/openid/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(env.VOW_REDIRECT_URI);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid");
    expect(url.searchParams.get("mls")).toBe("washington-mls");
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(state.split(".")).toHaveLength(2);
    expect(nonce.length).toBeGreaterThan(20);

    const insert = statements.find((statement) =>
      statement.sql.includes("insert into vow_authorization_attempts"),
    );
    expect(insert).toBeDefined();
    expect(insert?.values).not.toContain(state);
    expect(insert?.values).not.toContain(nonce);
    expect(insert?.values[4]).toBe("/account/");
  });

  test("verifies the ID token, uses Bearer access, encrypts tokens, and emits only an opaque session", async () => {
    const { env, statements, batches, setClaim } = activeEnv();
    const authorization = new URL(
      await startVowAuthorization(env, "washington", "/account/?tab=saved"),
    );
    const state = authorization.searchParams.get("state") || "";
    const nonce = authorization.searchParams.get("nonce") || "";
    setClaim({
      id: "attempt-1",
      scope_key: "washington-vow",
      nonce_hash: await sha256Hex(nonce),
      redirect_after: "/account/?tab=saved",
    });
    const idToken = await signedIdToken(nonce);

    const fetchRequests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchRequests.push({ url, init });
      if (url.endsWith("/openid/token")) {
        return Response.json({
          access_token: "raw-access-token",
          refresh_token: "raw-refresh-token",
          id_token: idToken.token,
          token_type: "Bearer",
          expires_in: 86400,
        });
      }
      if (url.endsWith("/openid/jwks")) {
        return Response.json({ keys: [idToken.publicJwk] });
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

    expect(fetchRequests).toHaveLength(3);
    const tokenBody = JSON.parse(String(fetchRequests[0]?.init?.body));
    expect(tokenBody).toMatchObject({
      client_id: "client-id",
      client_secret: "client-secret",
      grant_type: "authorization_code",
      code: "authorization-code",
      redirect_uri: env.VOW_REDIRECT_URI,
    });
    expect(fetchRequests[1]?.url).toBe("https://sparkplatform.com/openid/jwks");
    expect(
      (fetchRequests[2]?.init?.headers as Record<string, string>).authorization,
    ).toBe("Bearer raw-access-token");

    expect(batches).toHaveLength(1);
    const tokenInsert = batches[0]?.find((statement) =>
      statement.sql.includes("insert into vow_oauth_tokens"),
    );
    const serializedValues = JSON.stringify(tokenInsert?.values || []);
    expect(serializedValues).not.toContain("raw-access-token");
    expect(serializedValues).not.toContain("raw-refresh-token");
    expect(serializedValues).toContain("v1.");

    const identityInsert = batches[0]?.find((statement) =>
      statement.sql.includes("insert into external_identities"),
    );
    expect(identityInsert?.values).toContain("oidc:https://sparkplatform.com");
    expect(identityInsert?.values).toContain("spark-user-1");

    const claimStatement = statements.find((statement) =>
      statement.sql.includes("returning id, scope_key, nonce_hash, redirect_after"),
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
