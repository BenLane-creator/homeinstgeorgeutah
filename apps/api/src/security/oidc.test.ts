import { describe, expect, test } from "bun:test";
import {
  OidcVerificationError,
  sha256Hex,
  verifyOidcIdToken,
} from "./oidc";

function base64Url(value: Uint8Array | string) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function fixture(overrides: Record<string, unknown> = {}) {
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

  const now = 2_000_000_000;
  const nonce = "nonce-value";
  const header = base64Url(
    JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" }),
  );
  const claims = base64Url(
    JSON.stringify({
      iss: "https://issuer.example",
      sub: "consumer-123",
      aud: "client-123",
      exp: now + 600,
      iat: now - 10,
      nonce,
      ...overrides,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );

  return {
    token: `${signingInput}.${base64Url(signature)}`,
    nonce,
    now,
    jwk: publicJwk,
  };
}

function jwksFetcher(jwk: JsonWebKey) {
  return (async () =>
    new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("verifyOidcIdToken", () => {
  test("verifies signature, issuer, audience, lifetime, and nonce", async () => {
    const data = await fixture();
    const verified = await verifyOidcIdToken(
      {
        idToken: data.token,
        issuer: "https://issuer.example",
        audience: "client-123",
        expectedNonceHash: await sha256Hex(data.nonce),
        jwksUrl: "https://issuer.example/jwks",
        nowSeconds: data.now,
      },
      jwksFetcher(data.jwk),
    );

    expect(verified.subject).toBe("consumer-123");
    expect(verified.algorithm).toBe("RS256");
  });

  test("rejects a modified signature", async () => {
    const data = await fixture();
    const [header, claims, signature] = data.token.split(".");
    const modified = `${header}.${claims}.${signature.slice(0, -1)}A`;

    await expect(
      verifyOidcIdToken(
        {
          idToken: modified,
          issuer: "https://issuer.example",
          audience: "client-123",
          expectedNonceHash: await sha256Hex(data.nonce),
          jwksUrl: "https://issuer.example/jwks",
          nowSeconds: data.now,
        },
        jwksFetcher(data.jwk),
      ),
    ).rejects.toBeInstanceOf(OidcVerificationError);
  });

  test("rejects issuer, audience, and nonce mismatches", async () => {
    const data = await fixture();
    for (const input of [
      {
        issuer: "https://wrong.example",
        audience: "client-123",
        nonce: data.nonce,
      },
      {
        issuer: "https://issuer.example",
        audience: "wrong-client",
        nonce: data.nonce,
      },
      {
        issuer: "https://issuer.example",
        audience: "client-123",
        nonce: "wrong-nonce",
      },
    ]) {
      await expect(
        verifyOidcIdToken(
          {
            idToken: data.token,
            issuer: input.issuer,
            audience: input.audience,
            expectedNonceHash: await sha256Hex(input.nonce),
            jwksUrl: "https://issuer.example/jwks",
            nowSeconds: data.now,
          },
          jwksFetcher(data.jwk),
        ),
      ).rejects.toMatchObject({ code: "OIDC_CLAIMS_INVALID" });
    }
  });

  test("requires azp when the token has multiple audiences", async () => {
    const data = await fixture({ aud: ["client-123", "other-client"] });
    await expect(
      verifyOidcIdToken(
        {
          idToken: data.token,
          issuer: "https://issuer.example",
          audience: "client-123",
          expectedNonceHash: await sha256Hex(data.nonce),
          jwksUrl: "https://issuer.example/jwks",
          nowSeconds: data.now,
        },
        jwksFetcher(data.jwk),
      ),
    ).rejects.toMatchObject({ code: "OIDC_CLAIMS_INVALID" });
  });
});
