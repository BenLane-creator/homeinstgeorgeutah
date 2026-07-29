export type OidcClaims = {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
};

type OidcHeader = {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
};

type SigningJwk = JsonWebKey & {
  kid?: string;
  use?: string;
  alg?: string;
};

export class OidcVerificationError extends Error {
  constructor(
    public readonly code: string,
    message = "The identity token could not be verified.",
  ) {
    super(message);
  }
}

const encoder = new TextEncoder();

function base64UrlBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new OidcVerificationError("OIDC_TOKEN_ENCODING_INVALID");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new OidcVerificationError("OIDC_TOKEN_ENCODING_INVALID");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseSegment<T>(value: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlBytes(value))) as T;
  } catch (error) {
    if (error instanceof OidcVerificationError) throw error;
    throw new OidcVerificationError("OIDC_TOKEN_JSON_INVALID");
  }
}

export async function sha256Hex(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function audienceMatches(audience: unknown, clientId: string) {
  return (
    audience === clientId ||
    (Array.isArray(audience) &&
      audience.every((item) => typeof item === "string") &&
      audience.includes(clientId))
  );
}

function numericClaim(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function verificationAlgorithms(algorithm: string) {
  if (algorithm === "RS256") {
    return {
      importAlgorithm: {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      } as RsaHashedImportParams,
      verifyAlgorithm: { name: "RSASSA-PKCS1-v1_5" } as AlgorithmIdentifier,
    };
  }
  if (algorithm === "ES256") {
    return {
      importAlgorithm: {
        name: "ECDSA",
        namedCurve: "P-256",
      } as EcKeyImportParams,
      verifyAlgorithm: {
        name: "ECDSA",
        hash: "SHA-256",
      } as EcdsaParams,
    };
  }
  throw new OidcVerificationError("OIDC_ALGORITHM_REJECTED");
}

export async function verifyOidcIdToken(
  input: {
    idToken: string;
    issuer: string;
    audience: string;
    expectedNonceHash: string;
    jwksUrl: string;
    nowSeconds?: number;
  },
  fetcher: typeof fetch = fetch,
) {
  if (
    !input.idToken ||
    input.idToken.length > 16_384 ||
    !validHttpsUrl(input.issuer) ||
    !validHttpsUrl(input.jwksUrl) ||
    !input.audience ||
    !/^[a-f0-9]{64}$/i.test(input.expectedNonceHash)
  ) {
    throw new OidcVerificationError("OIDC_CONFIGURATION_INVALID");
  }

  const segments = input.idToken.split(".");
  if (segments.length !== 3) {
    throw new OidcVerificationError("OIDC_TOKEN_FORMAT_INVALID");
  }

  const header = parseSegment<OidcHeader>(segments[0]);
  const claims = parseSegment<OidcClaims>(segments[1]);
  const algorithm = typeof header.alg === "string" ? header.alg : "";
  const keyId = typeof header.kid === "string" ? header.kid : "";
  if (!keyId || !new Set(["RS256", "ES256"]).has(algorithm)) {
    throw new OidcVerificationError("OIDC_ALGORITHM_REJECTED");
  }
  if (header.typ !== undefined && header.typ !== "JWT") {
    throw new OidcVerificationError("OIDC_TOKEN_TYPE_INVALID");
  }

  const jwksResponse = await fetcher(input.jwksUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  const jwks = (await jwksResponse.json().catch(() => ({}))) as {
    keys?: SigningJwk[];
  };
  if (!jwksResponse.ok || !Array.isArray(jwks.keys)) {
    throw new OidcVerificationError("OIDC_SIGNING_KEYS_UNAVAILABLE");
  }
  const jwk = jwks.keys.find((candidate) => candidate.kid === keyId);
  if (
    !jwk ||
    (jwk.use && jwk.use !== "sig") ||
    (jwk.alg && jwk.alg !== algorithm)
  ) {
    throw new OidcVerificationError("OIDC_SIGNING_KEY_REJECTED");
  }

  const algorithms = verificationAlgorithms(algorithm);
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      algorithms.importAlgorithm,
      false,
      ["verify"],
    );
  } catch {
    throw new OidcVerificationError("OIDC_SIGNING_KEY_REJECTED");
  }

  const verified = await crypto.subtle.verify(
    algorithms.verifyAlgorithm,
    key,
    base64UrlBytes(segments[2]),
    encoder.encode(`${segments[0]}.${segments[1]}`),
  );
  if (!verified) {
    throw new OidcVerificationError("OIDC_SIGNATURE_INVALID");
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const expiresAt = numericClaim(claims.exp);
  const notBefore = numericClaim(claims.nbf);
  const issuedAt = numericClaim(claims.iat);
  const issuer = typeof claims.iss === "string" ? claims.iss : "";
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  const nonce = typeof claims.nonce === "string" ? claims.nonce : "";
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const authorizedParty = typeof claims.azp === "string" ? claims.azp : "";

  if (
    issuer !== input.issuer ||
    !subject ||
    subject.length > 255 ||
    !audienceMatches(claims.aud, input.audience) ||
    expiresAt === null ||
    expiresAt <= now - 60 ||
    (notBefore !== null && notBefore > now + 60) ||
    (issuedAt !== null && issuedAt > now + 300) ||
    !nonce ||
    (await sha256Hex(nonce)) !== input.expectedNonceHash ||
    (audiences.length > 1 && authorizedParty !== input.audience)
  ) {
    throw new OidcVerificationError("OIDC_CLAIMS_INVALID");
  }

  return {
    issuer,
    subject,
    claims,
    algorithm,
    keyId,
  };
}
