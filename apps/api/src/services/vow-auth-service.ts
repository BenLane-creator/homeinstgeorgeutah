import {
  getActiveVowSource,
  type MlsCounty,
  type MlsScopeEnv,
} from "./mls-scope-service";

export interface VowAuthEnv extends MlsScopeEnv {
  DB: D1Database;
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

export type VowSessionIdentity = {
  userAccountId: string;
  contactId: string;
  email: string;
  displayName: string;
  sessionExpiresAt: string;
  scopes: string[];
};

const SESSION_COOKIE = "__Host-hisgu_session";
const STATE_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Bytes(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function sha256Hex(value: string) {
  return Array.from(await sha256Bytes(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))),
  );
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let result = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    result |= leftBytes[index] ^ rightBytes[index];
  }
  return result === 0;
}

async function createState(secret: string) {
  const random = randomToken();
  return `${random}.${await hmac(random, secret)}`;
}

async function verifyStateSignature(state: string, secret: string) {
  const [random, suppliedSignature, extra] = state.split(".");
  if (!random || !suppliedSignature || extra || state.length > 256) return false;
  const expectedSignature = await hmac(random, secret);
  return constantTimeEqual(suppliedSignature, expectedSignature);
}

function safeReturnTo(value: string | null | undefined) {
  const normalized = value?.trim() || "/account/";
  if (
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    normalized.includes("\\") ||
    normalized.length > 500
  ) {
    return "/account/";
  }
  return normalized;
}

function expiresAt(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function encryptionKey(secret: string) {
  if (secret.length < 32) {
    throw new VowAuthError(
      503,
      "VOW_ENCRYPTION_NOT_CONFIGURED",
      "Consumer account access is temporarily unavailable.",
    );
  }
  return crypto.subtle.importKey(
    "raw",
    await sha256Bytes(secret),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
}

async function encryptToken(value: string, secret: string) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await encryptionKey(secret),
      encoder.encode(value),
    ),
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(encrypted)}`;
}

function parseCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const pair of cookies.split(";")) {
    const [key, ...parts] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

export function clearVowSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function firstSparkResult(payload: unknown) {
  const root = asRecord(payload);
  const nested = asRecord(root?.D);
  const success = nested?.Success ?? root?.Success;
  if (success === false) {
    throw new VowAuthError(
      502,
      "VOW_PROVIDER_RESPONSE_INVALID",
      "Consumer account authorization could not be completed.",
    );
  }
  const results = Array.isArray(nested?.Results)
    ? nested.Results
    : Array.isArray(root?.Results)
      ? root.Results
      : [];
  return asRecord(results[0]);
}

function parseContact(payload: unknown) {
  const contact = firstSparkResult(payload);
  const externalId = asString(contact?.Id);
  const email = asString(contact?.PrimaryEmail).toLowerCase();
  const displayName =
    asString(contact?.DisplayName) ||
    [asString(contact?.GivenName), asString(contact?.FamilyName)].filter(Boolean).join(" ");
  if (!externalId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new VowAuthError(
      502,
      "VOW_CONTACT_IDENTITY_INCOMPLETE",
      "The authorized consumer account did not provide a usable identity.",
    );
  }
  const name = displayName || email.split("@")[0];
  const nameParts = name.split(/\s+/).filter(Boolean);
  return {
    externalId,
    email,
    displayName: name,
    firstName: asString(contact?.GivenName) || nameParts[0] || "",
    lastName:
      asString(contact?.FamilyName) ||
      (nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""),
  };
}

function parseTokenResponse(payload: unknown) {
  const root = asRecord(payload);
  const accessToken = asString(root?.access_token);
  const refreshToken = asString(root?.refresh_token);
  const rawExpiresIn = Number(root?.expires_in);
  const expiresIn =
    Number.isFinite(rawExpiresIn) && rawExpiresIn > 0 && rawExpiresIn <= 7 * 24 * 60 * 60
      ? Math.floor(rawExpiresIn)
      : 24 * 60 * 60;
  if (!accessToken) {
    throw new VowAuthError(
      502,
      "VOW_TOKEN_EXCHANGE_FAILED",
      "Consumer account authorization could not be completed.",
    );
  }
  return { accessToken, refreshToken, expiresIn };
}

export async function startVowAuthorization(
  env: VowAuthEnv,
  county: MlsCounty,
  returnTo?: string | null,
) {
  const source = getActiveVowSource(env, county);
  if (!source) {
    throw new VowAuthError(
      503,
      "VOW_AUTHORIZATION_PENDING",
      "Consumer account access is not active while MLS authorization remains pending.",
    );
  }

  const state = await createState(source.stateSecret);
  const attemptId = crypto.randomUUID();
  await env.DB.prepare(
    `insert into vow_authorization_attempts
      (id, scope_key, state_hash, redirect_after, status, expires_at)
     values (?, ?, ?, ?, 'started', ?)`,
  )
    .bind(
      attemptId,
      source.scopeKey,
      await sha256Hex(state),
      safeReturnTo(returnTo),
      expiresAt(STATE_TTL_SECONDS),
    )
    .run();

  const authorizationUrl = new URL(source.authorizationUrl);
  authorizationUrl.searchParams.set("client_id", source.clientId);
  authorizationUrl.searchParams.set("redirect_uri", source.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("state", state);
  if (source.mlsId) authorizationUrl.searchParams.set("mls", source.mlsId);

  return authorizationUrl.toString();
}

type ClaimedAttempt = {
  id: string;
  scope_key: `${MlsCounty}-vow`;
  redirect_after: string | null;
};

async function claimAttempt(env: VowAuthEnv, state: string) {
  const claimed = await env.DB.prepare(
    `update vow_authorization_attempts
        set claimed_at = CURRENT_TIMESTAMP
      where state_hash = ?
        and status = 'started'
        and claimed_at is null
        and expires_at > CURRENT_TIMESTAMP
      returning id, scope_key, redirect_after`,
  )
    .bind(await sha256Hex(state))
    .first<ClaimedAttempt>();
  if (!claimed) {
    throw new VowAuthError(
      400,
      "VOW_STATE_INVALID",
      "The consumer authorization request is invalid, expired, or already used.",
    );
  }
  return claimed;
}

async function markAttempt(
  env: VowAuthEnv,
  attemptId: string,
  status: "rejected" | "failed",
  errorCode: string,
) {
  await env.DB.prepare(
    `update vow_authorization_attempts
        set status = ?, error_code = ?, completed_at = CURRENT_TIMESTAMP
      where id = ?`,
  )
    .bind(status, errorCode.slice(0, 120), attemptId)
    .run();
}

async function exchangeAuthorizationCode(
  source: NonNullable<ReturnType<typeof getActiveVowSource>>,
  code: string,
) {
  const response = await fetch(source.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: source.clientId,
      client_secret: source.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: source.redirectUri,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new VowAuthError(
      502,
      "VOW_TOKEN_EXCHANGE_FAILED",
      "Consumer account authorization could not be completed.",
    );
  }
  return parseTokenResponse(payload);
}

async function fetchCurrentContact(
  source: NonNullable<ReturnType<typeof getActiveVowSource>>,
  accessToken: string,
) {
  const response = await fetch(source.contactUrl, {
    headers: {
      authorization: `OAuth ${accessToken}`,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(8_000),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new VowAuthError(
      502,
      "VOW_CONTACT_LOOKUP_FAILED",
      "The authorized consumer account could not be verified.",
    );
  }
  return parseContact(payload);
}

export async function completeVowAuthorization(env: VowAuthEnv, url: URL) {
  const state = asString(url.searchParams.get("state"));
  if (!state || !(await verifyStateSignature(state, env.VOW_STATE_SECRET?.trim() || ""))) {
    throw new VowAuthError(
      400,
      "VOW_STATE_INVALID",
      "The consumer authorization request is invalid or expired.",
    );
  }

  const attempt = await claimAttempt(env, state);
  const county = attempt.scope_key.startsWith("washington") ? "washington" : "iron";
  const source = getActiveVowSource(env, county);
  if (!source || source.scopeKey !== attempt.scope_key) {
    await markAttempt(env, attempt.id, "failed", "scope_inactive");
    throw new VowAuthError(
      503,
      "VOW_AUTHORIZATION_PENDING",
      "Consumer account access is not active for this MLS scope.",
    );
  }

  const providerError = asString(url.searchParams.get("error"));
  if (providerError) {
    await markAttempt(env, attempt.id, "rejected", providerError);
    throw new VowAuthError(
      400,
      "VOW_AUTHORIZATION_REJECTED",
      asString(url.searchParams.get("error_description")) ||
        "The consumer authorization request was not completed.",
    );
  }

  const code = asString(url.searchParams.get("code"));
  if (!code || code.length > 2_048) {
    await markAttempt(env, attempt.id, "failed", "missing_code");
    throw new VowAuthError(
      400,
      "VOW_CODE_REQUIRED",
      "The consumer authorization response did not include a valid code.",
    );
  }

  try {
    const token = await exchangeAuthorizationCode(source, code);
    const contact = await fetchCurrentContact(source, token.accessToken);
    const accessTokenEncrypted = await encryptToken(
      token.accessToken,
      source.tokenEncryptionKey,
    );
    const refreshTokenEncrypted = token.refreshToken
      ? await encryptToken(token.refreshToken, source.tokenEncryptionKey)
      : null;
    const sessionToken = randomToken();
    const sessionHash = await sha256Hex(sessionToken);
    const contactCandidateId = crypto.randomUUID();
    const userCandidateId = crypto.randomUUID();
    const grantCandidateId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const accessExpiresAt = expiresAt(token.expiresIn);
    const sessionExpiresAt = expiresAt(SESSION_TTL_SECONDS);
    const provider = `spark-vow:${county}`;

    const contactIdSql =
      "(select id from contacts where email_normalized = ? limit 1)";
    const userIdSql =
      "(select id from user_accounts where email_normalized = ? limit 1)";
    const grantIdSql =
      "(select id from vow_access_grants where user_account_id = " +
      userIdSql +
      " and scope_key = ? limit 1)";

    const results = await env.DB.batch([
      env.DB.prepare(
        `insert into contacts
          (id, full_name, first_name, last_name, email, email_normalized, source)
         values (?, ?, ?, ?, ?, ?, 'vow')
         on conflict(email_normalized) do update set
           full_name = case when excluded.full_name <> '' then excluded.full_name else contacts.full_name end,
           first_name = case when excluded.first_name <> '' then excluded.first_name else contacts.first_name end,
           last_name = case when excluded.last_name <> '' then excluded.last_name else contacts.last_name end,
           email = excluded.email,
           status = 'active',
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        contactCandidateId,
        contact.displayName,
        contact.firstName,
        contact.lastName,
        contact.email,
        contact.email,
      ),
      env.DB.prepare(
        `insert into user_accounts
          (id, contact_id, email, email_normalized, status)
         values (?, ${contactIdSql}, ?, ?, 'active')
         on conflict(email_normalized) do update set
           contact_id = coalesce(user_accounts.contact_id, excluded.contact_id),
           email = excluded.email,
           status = 'active',
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(userCandidateId, contact.email, contact.email, contact.email),
      env.DB.prepare(
        `insert into external_identities (id, contact_id, provider, external_id)
         values (?, ${contactIdSql}, ?, ?)
         on conflict(provider, external_id) do update set
           contact_id = excluded.contact_id`,
      ).bind(crypto.randomUUID(), contact.email, provider, contact.externalId),
      env.DB.prepare(
        `insert into vow_access_grants
          (id, user_account_id, scope_key, provider_contact_id, status,
           authenticated_at, expires_at, last_seen_at)
         values (?, ${userIdSql}, ?, ?, 'active', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
         on conflict(user_account_id, scope_key) do update set
           provider_contact_id = excluded.provider_contact_id,
           status = 'active',
           authenticated_at = CURRENT_TIMESTAMP,
           expires_at = excluded.expires_at,
           last_seen_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        grantCandidateId,
        contact.email,
        source.scopeKey,
        contact.externalId,
        accessExpiresAt,
      ),
      env.DB.prepare(
        `insert into vow_oauth_tokens
          (grant_id, access_token_encrypted, refresh_token_encrypted, token_type,
           access_expires_at)
         values (${grantIdSql}, ?, ?, 'OAuth', ?)
         on conflict(grant_id) do update set
           access_token_encrypted = excluded.access_token_encrypted,
           refresh_token_encrypted = excluded.refresh_token_encrypted,
           token_type = excluded.token_type,
           access_expires_at = excluded.access_expires_at,
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(
        contact.email,
        source.scopeKey,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        accessExpiresAt,
      ),
      env.DB.prepare(
        `insert into user_auth_sessions
          (id, user_account_id, session_hash, expires_at)
         values (?, ${userIdSql}, ?, ?)`,
      ).bind(sessionId, contact.email, sessionHash, sessionExpiresAt),
      env.DB.prepare(
        `update vow_authorization_attempts
            set user_account_id = ${userIdSql}, status = 'completed',
                completed_at = CURRENT_TIMESTAMP, error_code = null
          where id = ?`,
      ).bind(contact.email, attempt.id),
      env.DB.prepare(
        `insert into consumer_audit_events
          (id, user_account_id, event_type, scope_key, payload_json)
         values (?, ${userIdSql}, 'vow_login', ?, ?)`,
      ).bind(
        auditId,
        contact.email,
        source.scopeKey,
        JSON.stringify({ providerContactId: contact.externalId }),
      ),
      env.DB.prepare(
        `select ua.id as user_account_id, ua.contact_id
           from user_accounts ua
          where ua.email_normalized = ?
          limit 1`,
      ).bind(contact.email),
    ]);

    const stored = results.at(-1)?.results?.[0] as
      | { user_account_id?: unknown; contact_id?: unknown }
      | undefined;
    if (!asString(stored?.user_account_id) || !asString(stored?.contact_id)) {
      throw new Error("VOW account transaction did not return a local identity.");
    }

    return {
      redirectTo: safeReturnTo(attempt.redirect_after),
      sessionCookie: sessionCookie(sessionToken),
    };
  } catch (error) {
    await markAttempt(
      env,
      attempt.id,
      "failed",
      error instanceof VowAuthError ? error.code : "account_link_failed",
    ).catch(() => undefined);
    throw error;
  }
}

export async function readVowSession(
  env: VowAuthEnv,
  request: Request,
): Promise<VowSessionIdentity | null> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token || token.length > 512) return null;
  const sessionHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `select uas.id as session_id, uas.expires_at, ua.id as user_account_id,
            ua.contact_id, ua.email, c.full_name
       from user_auth_sessions uas
       join user_accounts ua on ua.id = uas.user_account_id
       left join contacts c on c.id = ua.contact_id
      where uas.session_hash = ?
        and uas.expires_at > CURRENT_TIMESTAMP
        and ua.status = 'active'
      limit 1`,
  )
    .bind(sessionHash)
    .first<{
      session_id: string;
      expires_at: string;
      user_account_id: string;
      contact_id: string;
      email: string;
      full_name: string | null;
    }>();
  if (!row) return null;

  const grants = await env.DB.prepare(
    `select scope_key
       from vow_access_grants
      where user_account_id = ?
        and status = 'active'
      order by scope_key`,
  )
    .bind(row.user_account_id)
    .all<{ scope_key: string }>();

  return {
    userAccountId: row.user_account_id,
    contactId: row.contact_id,
    email: row.email,
    displayName: row.full_name || row.email,
    sessionExpiresAt: row.expires_at,
    scopes: grants.results.map((grant) => grant.scope_key),
  };
}

export async function revokeVowSession(env: VowAuthEnv, request: Request) {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return;
  const sessionHash = await sha256Hex(token);
  const session = await env.DB.prepare(
    "select user_account_id from user_auth_sessions where session_hash = ? limit 1",
  )
    .bind(sessionHash)
    .first<{ user_account_id: string }>();
  await env.DB.prepare("delete from user_auth_sessions where session_hash = ?")
    .bind(sessionHash)
    .run();
  if (session?.user_account_id) {
    await env.DB.prepare(
      `insert into consumer_audit_events
        (id, user_account_id, event_type, payload_json)
       values (?, ?, 'vow_logout', '{}')`,
    )
      .bind(crypto.randomUUID(), session.user_account_id)
      .run();
  }
}
