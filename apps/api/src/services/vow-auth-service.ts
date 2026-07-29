import {
  base64UrlDecode,
  createPkcePair,
  decryptString,
  encodeJsonBase64Url,
  encryptString,
  parseJsonBase64Url,
  randomToken,
  sha256,
  signHmac,
  verifyHmac,
} from "../security/crypto";
import {
  accountSessionCookie,
  createAccountSession,
  type AccountServiceEnv,
} from "./account-service";
import {
  getActiveVowProvider,
  type ActiveVowProvider,
  type MlsCounty,
  type MlsScopeEnv,
} from "./mls-scope-service";

export interface VowAuthEnv extends AccountServiceEnv, MlsScopeEnv {
  SITE_URL?: string;
}

export class VowAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type StatePayload = {
  attemptId: string;
  county: MlsCounty;
  random: string;
  exp: number;
};

type AttemptRow = {
  id: string;
  scope_key: `${MlsCounty}-vow`;
  state_hash: string;
  nonce_hash: string;
  redirect_after: string | null;
  status: string;
  expires_at: string;
  pkce_verifier_ciphertext: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type IdTokenClaims = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
};

function safeRedirect(value: string | null | undefined) {
  const redirect = value?.trim() || "/account/";
  if (
    !redirect.startsWith("/") ||
    redirect.startsWith("//") ||
    redirect.includes("\\") ||
    redirect.length > 500
  ) {
    return "/account/";
  }
  return redirect;
}

async function signedState(secret: string, payload: StatePayload) {
  const encoded = encodeJsonBase64Url(payload);
  return `${encoded}.${await signHmac(secret, encoded)}`;
}

async function parseSignedState(secret: string, value: string) {
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra) {
    throw new VowAuthError(400, "VOW_STATE_INVALID", "The authorization state is invalid.");
  }
  if (!(await verifyHmac(secret, encoded, signature))) {
    throw new VowAuthError(400, "VOW_STATE_INVALID", "The authorization state is invalid.");
  }
  let payload: StatePayload;
  try {
    payload = parseJsonBase64Url<StatePayload>(encoded);
  } catch {
    throw new VowAuthError(400, "VOW_STATE_INVALID", "The authorization state is invalid.");
  }
  if (
    !payload.attemptId ||
    (payload.county !== "washington" && payload.county !== "iron") ||
    !payload.random ||
    payload.exp < Math.floor(Date.now() / 1_000)
  ) {
    throw new VowAuthError(400, "VOW_STATE_EXPIRED", "The authorization request expired.");
  }
  return payload;
}

export async function beginVowAuthorization(
  env: VowAuthEnv,
  county: MlsCounty,
  redirectAfter?: string | null,
) {
  const provider = getActiveVowProvider(env, county);
  if (!provider) {
    throw new VowAuthError(
      503,
      "VOW_SCOPE_INACTIVE",
      `${county === "washington" ? "Washington" : "Iron"} County account access is not active.`,
    );
  }

  const attemptId = crypto.randomUUID();
  const nonce = randomToken(32);
  const pair = await createPkcePair();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1_000).toISOString();
  const state = await signedState(provider.stateSecret, {
    attemptId,
    county,
    random: randomToken(24),
    exp: Math.floor(Date.now() / 1_000) + 10 * 60,
  });
  const redirect = safeRedirect(redirectAfter);

  await env.DB.batch([
    env.DB.prepare(
      `insert into vow_authorization_attempts (
        id, scope_key, state_hash, nonce_hash, redirect_after, status,
        expires_at, pkce_verifier_ciphertext
      ) values (?, ?, ?, ?, ?, 'started', ?, ?)`,
    ).bind(
      attemptId,
      provider.scopeKey,
      await sha256(state),
      await sha256(nonce),
      redirect,
      expiresAt,
      await encryptString(provider.stateSecret, pair.verifier),
    ),
    env.DB.prepare(
      `insert into account_audit_events (
        id, event_type, scope_key, payload_json
      ) values (?, 'vow_authorization_started', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      provider.scopeKey,
      JSON.stringify({ attemptId, redirectAfter: redirect }),
    ),
  ]);

  const authorizationUrl = new URL(provider.authorizationUrl);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", provider.clientId);
  authorizationUrl.searchParams.set("redirect_uri", provider.redirectUri);
  authorizationUrl.searchParams.set("scope", provider.scopes);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", pair.challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  if (provider.mlsId) authorizationUrl.searchParams.set("mls", provider.mlsId);

  return authorizationUrl.toString();
}

function standardBase64(value: string) {
  const encoded = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of encoded) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function exchangeAuthorizationCode(
  provider: ActiveVowProvider,
  code: string,
  verifier: string,
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: provider.redirectUri,
    client_id: provider.clientId,
    code_verifier: verifier,
  });
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  });
  if (provider.tokenAuthMethod === "client_secret_basic") {
    headers.set(
      "authorization",
      `Basic ${standardBase64(`${provider.clientId}:${provider.clientSecret}`)}`,
    );
  } else {
    body.set("client_secret", provider.clientSecret);
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || payload.error) {
    throw new VowAuthError(
      502,
      "VOW_TOKEN_EXCHANGE_FAILED",
      payload.error_description || "The account authorization could not be completed.",
    );
  }
  if (!payload.access_token || !payload.id_token) {
    throw new VowAuthError(
      502,
      "VOW_TOKEN_RESPONSE_INVALID",
      "The authorization provider returned an incomplete token response.",
    );
  }
  return payload as Required<Pick<TokenResponse, "access_token" | "id_token">> &
    TokenResponse;
}

async function verifyIdToken(
  provider: ActiveVowProvider,
  idToken: string,
  expectedNonceHash: string,
) {
  const segments = idToken.split(".");
  if (segments.length !== 3) {
    throw new VowAuthError(502, "VOW_ID_TOKEN_INVALID", "The identity token is invalid.");
  }

  let header: { alg?: string; kid?: string };
  let claims: IdTokenClaims;
  try {
    header = parseJsonBase64Url(segments[0]);
    claims = parseJsonBase64Url(segments[1]);
  } catch {
    throw new VowAuthError(502, "VOW_ID_TOKEN_INVALID", "The identity token is invalid.");
  }

  if (!header.kid || (header.alg !== "RS256" && header.alg !== "ES256")) {
    throw new VowAuthError(
      502,
      "VOW_ID_TOKEN_ALGORITHM_REJECTED",
      "The identity token uses an unsupported signing algorithm.",
    );
  }

  const jwksResponse = await fetch(provider.jwksUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  const jwks = (await jwksResponse.json().catch(() => ({}))) as {
    keys?: JsonWebKey[];
  };
  const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwksResponse.ok || !jwk) {
    throw new VowAuthError(
      502,
      "VOW_SIGNING_KEY_UNAVAILABLE",
      "The authorization signing key is unavailable.",
    );
  }

  const algorithm: RsaHashedImportParams | EcKeyImportParams =
    header.alg === "RS256"
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : { name: "ECDSA", namedCurve: "P-256" };
  const key = await crypto.subtle.importKey("jwk", jwk, algorithm, false, [
    "verify",
  ]);
  const verificationAlgorithm: AlgorithmIdentifier | EcdsaParams =
    header.alg === "RS256"
      ? { name: "RSASSA-PKCS1-v1_5" }
      : { name: "ECDSA", hash: "SHA-256" };
  const verified = await crypto.subtle.verify(
    verificationAlgorithm,
    key,
    base64UrlDecode(segments[2]),
    new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
  );
  if (!verified) {
    throw new VowAuthError(
      502,
      "VOW_ID_TOKEN_SIGNATURE_INVALID",
      "The identity token signature is invalid.",
    );
  }

  const now = Math.floor(Date.now() / 1_000);
  const audienceMatches =
    claims.aud === provider.clientId ||
    (Array.isArray(claims.aud) && claims.aud.includes(provider.clientId));
  if (
    claims.iss !== provider.issuer ||
    !audienceMatches ||
    typeof claims.exp !== "number" ||
    claims.exp <= now - 30 ||
    (typeof claims.nbf === "number" && claims.nbf > now + 60) ||
    (typeof claims.iat === "number" && claims.iat > now + 300) ||
    !claims.sub ||
    !claims.nonce ||
    (await sha256(claims.nonce)) !== expectedNonceHash
  ) {
    throw new VowAuthError(
      502,
      "VOW_ID_TOKEN_CLAIMS_INVALID",
      "The identity token claims could not be verified.",
    );
  }
  return claims;
}

async function verifiedIdentity(
  provider: ActiveVowProvider,
  tokens: TokenResponse & { access_token: string; id_token: string },
  nonceHash: string,
) {
  const claims = await verifyIdToken(provider, tokens.id_token, nonceHash);
  let identity: IdTokenClaims = claims;

  if (provider.userinfoUrl) {
    const response = await fetch(provider.userinfoUrl, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${tokens.access_token}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    const userinfo = (await response.json().catch(() => ({}))) as IdTokenClaims;
    if (!response.ok || userinfo.sub !== claims.sub) {
      throw new VowAuthError(
        502,
        "VOW_USERINFO_INVALID",
        "The account profile could not be verified.",
      );
    }
    identity = { ...claims, ...userinfo, sub: claims.sub, iss: claims.iss };
  }

  const email = identity.email?.trim().toLowerCase() || "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
    identity.email_verified === false
  ) {
    throw new VowAuthError(
      403,
      "VOW_VERIFIED_EMAIL_REQUIRED",
      "A verified email address is required for the consumer account.",
    );
  }

  const fullName =
    identity.name?.trim() ||
    [identity.given_name, identity.family_name].filter(Boolean).join(" ").trim() ||
    email.split("@")[0];
  return {
    issuer: claims.iss as string,
    subject: claims.sub as string,
    email,
    fullName: fullName.slice(0, 120),
  };
}

async function attemptForState(
  env: VowAuthEnv,
  provider: ActiveVowProvider,
  state: string,
  payload: StatePayload,
) {
  const attempt = await env.DB.prepare(
    `select
      id, scope_key, state_hash, nonce_hash, redirect_after, status,
      expires_at, pkce_verifier_ciphertext
    from vow_authorization_attempts
    where id = ? and scope_key = ?
    limit 1`,
  )
    .bind(payload.attemptId, provider.scopeKey)
    .first<AttemptRow>();
  if (
    !attempt ||
    attempt.status !== "started" ||
    Date.parse(attempt.expires_at) <= Date.now() ||
    attempt.state_hash !== (await sha256(state)) ||
    !attempt.pkce_verifier_ciphertext
  ) {
    throw new VowAuthError(
      400,
      "VOW_AUTHORIZATION_ATTEMPT_INVALID",
      "The authorization request is missing, expired, or already used.",
    );
  }
  return attempt;
}

async function markAttemptRejected(
  env: VowAuthEnv,
  attempt: AttemptRow,
  code: string,
) {
  await env.DB.batch([
    env.DB.prepare(
      `update vow_authorization_attempts
       set status = 'rejected', error_code = ?, completed_at = CURRENT_TIMESTAMP
       where id = ? and status = 'started'`,
    ).bind(code.slice(0, 100), attempt.id),
    env.DB.prepare(
      `insert into account_audit_events (
        id, event_type, scope_key, payload_json
      ) values (?, 'vow_authorization_rejected', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      attempt.scope_key,
      JSON.stringify({ attemptId: attempt.id, code: code.slice(0, 100) }),
    ),
  ]);
}

async function linkAccount(
  env: VowAuthEnv,
  provider: ActiveVowProvider,
  attempt: AttemptRow,
  identity: {
    issuer: string;
    subject: string;
    email: string;
    fullName: string;
  },
  tokens: TokenResponse & { access_token: string },
) {
  const existingContact = await env.DB.prepare(
    `select id from contacts where email_normalized = ? limit 1`,
  )
    .bind(identity.email)
    .first<{ id: string }>();
  const existingAccount = await env.DB.prepare(
    `select id, contact_id from user_accounts where email_normalized = ? limit 1`,
  )
    .bind(identity.email)
    .first<{ id: string; contact_id: string | null }>();

  const contactId = existingContact?.id || existingAccount?.contact_id || crypto.randomUUID();
  const userAccountId = existingAccount?.id || crypto.randomUUID();
  const grantId = crypto.randomUUID();
  const accessExpiresAt =
    typeof tokens.expires_in === "number" && tokens.expires_in > 0
      ? new Date(Date.now() + Math.min(tokens.expires_in, 31_536_000) * 1_000).toISOString()
      : null;
  const encryptedAccessToken = await encryptString(
    provider.tokenEncryptionSecret,
    tokens.access_token,
  );
  const encryptedRefreshToken = tokens.refresh_token
    ? await encryptString(provider.tokenEncryptionSecret, tokens.refresh_token)
    : null;

  await env.DB.batch([
    env.DB.prepare(
      `insert into contacts (
        id, full_name, email, email_normalized, source, status
      ) values (?, ?, ?, ?, 'vow_oidc', 'active')
      on conflict(email_normalized) do update set
        full_name = coalesce(nullif(excluded.full_name, ''), contacts.full_name),
        email = excluded.email,
        updated_at = CURRENT_TIMESTAMP`,
    ).bind(contactId, identity.fullName, identity.email, identity.email),
    env.DB.prepare(
      `insert into user_accounts (
        id, contact_id, email, email_normalized, status
      ) values (?, ?, ?, ?, 'active')
      on conflict(email_normalized) do update set
        contact_id = coalesce(user_accounts.contact_id, excluded.contact_id),
        email = excluded.email,
        status = 'active',
        updated_at = CURRENT_TIMESTAMP`,
    ).bind(userAccountId, contactId, identity.email, identity.email),
    env.DB.prepare(
      `insert into external_identities (
        id, contact_id, provider, external_id
      ) values (?, ?, ?, ?)
      on conflict(provider, external_id) do update set contact_id = excluded.contact_id`,
    ).bind(
      crypto.randomUUID(),
      contactId,
      identity.issuer,
      identity.subject,
    ),
    env.DB.prepare(
      `insert into vow_account_grants (
        id, user_account_id, scope_key, issuer, subject, email_normalized,
        access_token_ciphertext, refresh_token_ciphertext, token_type,
        access_expires_at, granted_scopes, status, last_verified_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
      on conflict(user_account_id, scope_key) do update set
        issuer = excluded.issuer,
        subject = excluded.subject,
        email_normalized = excluded.email_normalized,
        access_token_ciphertext = excluded.access_token_ciphertext,
        refresh_token_ciphertext = excluded.refresh_token_ciphertext,
        token_type = excluded.token_type,
        access_expires_at = excluded.access_expires_at,
        granted_scopes = excluded.granted_scopes,
        status = 'active',
        last_verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      grantId,
      userAccountId,
      provider.scopeKey,
      identity.issuer,
      identity.subject,
      identity.email,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokens.token_type || "Bearer",
      accessExpiresAt,
      tokens.scope || provider.scopes,
    ),
  ]);

  return userAccountId;
}

export async function completeVowAuthorization(
  env: VowAuthEnv,
  request: Request,
) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  if (!state) {
    throw new VowAuthError(400, "VOW_STATE_REQUIRED", "Authorization state is required.");
  }

  let unsignedPayload: StatePayload | null = null;
  for (const county of ["washington", "iron"] as const) {
    const provider = getActiveVowProvider(env, county);
    if (!provider) continue;
    try {
      const payload = await parseSignedState(provider.stateSecret, state);
      if (payload.county === county) {
        unsignedPayload = payload;
        break;
      }
    } catch {
      // Continue so the state can be checked against the other independently
      // configured county scope without disclosing configuration details.
    }
  }
  if (!unsignedPayload) {
    throw new VowAuthError(400, "VOW_STATE_INVALID", "The authorization state is invalid.");
  }

  const provider = getActiveVowProvider(env, unsignedPayload.county);
  if (!provider) {
    throw new VowAuthError(
      503,
      "VOW_SCOPE_INACTIVE",
      "The county authorization scope is no longer active.",
    );
  }
  const payload = await parseSignedState(provider.stateSecret, state);
  const attempt = await attemptForState(env, provider, state, payload);

  const providerError = url.searchParams.get("error");
  if (providerError) {
    await markAttemptRejected(env, attempt, providerError);
    throw new VowAuthError(
      400,
      "VOW_AUTHORIZATION_REJECTED",
      url.searchParams.get("error_description") ||
        "The account authorization was not completed.",
    );
  }

  const code = url.searchParams.get("code")?.trim() || "";
  if (!code || code.length > 4_096) {
    await markAttemptRejected(env, attempt, "authorization_code_missing");
    throw new VowAuthError(
      400,
      "VOW_AUTHORIZATION_CODE_REQUIRED",
      "The authorization code is missing.",
    );
  }

  try {
    const verifier = await decryptString(
      provider.stateSecret,
      attempt.pkce_verifier_ciphertext,
    );
    const tokens = await exchangeAuthorizationCode(provider, code, verifier);
    const identity = await verifiedIdentity(provider, tokens, attempt.nonce_hash);
    const userAccountId = await linkAccount(
      env,
      provider,
      attempt,
      identity,
      tokens,
    );
    const session = await createAccountSession(env, userAccountId, request);

    await env.DB.batch([
      env.DB.prepare(
        `update vow_authorization_attempts
         set status = 'completed', completed_at = CURRENT_TIMESTAMP,
             user_account_id = ?, provider_issuer = ?, provider_subject = ?,
             user_email_normalized = ?, session_id = ?, error_code = null
         where id = ? and status = 'started'`,
      ).bind(
        userAccountId,
        identity.issuer,
        identity.subject,
        identity.email,
        session.sessionId,
        attempt.id,
      ),
      env.DB.prepare(
        `insert into account_audit_events (
          id, user_account_id, session_id, event_type, scope_key, payload_json
        ) values (?, ?, ?, 'vow_authorization_completed', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        userAccountId,
        session.sessionId,
        provider.scopeKey,
        JSON.stringify({ attemptId: attempt.id }),
      ),
    ]);

    return {
      redirectAfter: safeRedirect(attempt.redirect_after),
      cookie: accountSessionCookie(session.token, session.expiresAt),
    };
  } catch (error) {
    if (error instanceof VowAuthError) {
      await env.DB.prepare(
        `update vow_authorization_attempts
         set status = 'failed', error_code = ?, completed_at = CURRENT_TIMESTAMP
         where id = ? and status = 'started'`,
      )
        .bind(error.code.slice(0, 100), attempt.id)
        .run();
      throw error;
    }
    await env.DB.prepare(
      `update vow_authorization_attempts
       set status = 'failed', error_code = 'unexpected_error', completed_at = CURRENT_TIMESTAMP
       where id = ? and status = 'started'`,
    )
      .bind(attempt.id)
      .run();
    throw new VowAuthError(
      502,
      "VOW_AUTHORIZATION_FAILED",
      "The account authorization could not be completed.",
    );
  }
}
