export const MLS_COUNTIES = ["washington", "iron"] as const;
export const MLS_ROLES = ["idx", "vow"] as const;

export type MlsCounty = (typeof MLS_COUNTIES)[number];
export type MlsRole = (typeof MLS_ROLES)[number];
export type MlsApprovalStatus =
  | "not-requested"
  | "pending"
  | "approved"
  | "denied"
  | "suspended";
export type VowTokenAuthMethod = "client_secret_post" | "client_secret_basic";

export interface MlsScopeEnv {
  WASHINGTON_IDX_APPROVAL_STATUS?: string;
  WASHINGTON_IDX_ENABLED?: string;
  WASHINGTON_IDX_POLICY_VERSION?: string;
  WASHINGTON_IDX_PROVIDER?: string;
  WASHINGTON_IDX_API_BASE_URL?: string;
  WASHINGTON_IDX_ACCESS_TOKEN?: string;

  WASHINGTON_VOW_APPROVAL_STATUS?: string;
  WASHINGTON_VOW_ENABLED?: string;
  WASHINGTON_VOW_POLICY_VERSION?: string;
  WASHINGTON_VOW_CLIENT_ID?: string;
  WASHINGTON_VOW_CLIENT_SECRET?: string;
  WASHINGTON_VOW_AUTHORIZATION_URL?: string;
  WASHINGTON_VOW_TOKEN_URL?: string;
  WASHINGTON_VOW_ISSUER?: string;
  WASHINGTON_VOW_JWKS_URL?: string;
  WASHINGTON_VOW_USERINFO_URL?: string;
  WASHINGTON_VOW_SCOPES?: string;
  WASHINGTON_VOW_TOKEN_AUTH_METHOD?: string;
  WASHINGTON_VOW_MLS_ID?: string;

  IRON_IDX_APPROVAL_STATUS?: string;
  IRON_IDX_ENABLED?: string;
  IRON_IDX_POLICY_VERSION?: string;
  IRON_IDX_PROVIDER?: string;
  IRON_IDX_API_BASE_URL?: string;
  IRON_IDX_ACCESS_TOKEN?: string;

  IRON_VOW_APPROVAL_STATUS?: string;
  IRON_VOW_ENABLED?: string;
  IRON_VOW_POLICY_VERSION?: string;
  IRON_VOW_CLIENT_ID?: string;
  IRON_VOW_CLIENT_SECRET?: string;
  IRON_VOW_AUTHORIZATION_URL?: string;
  IRON_VOW_TOKEN_URL?: string;
  IRON_VOW_ISSUER?: string;
  IRON_VOW_JWKS_URL?: string;
  IRON_VOW_USERINFO_URL?: string;
  IRON_VOW_SCOPES?: string;
  IRON_VOW_TOKEN_AUTH_METHOD?: string;
  IRON_VOW_MLS_ID?: string;

  VOW_REDIRECT_URI?: string;
  VOW_STATE_SECRET?: string;
  VOW_TOKEN_ENCRYPTION_SECRET?: string;
}

export const APPROVED_POLICY_VERSIONS = {
  washington: {
    idx: "washington-county-idx-v1",
    vow: "washington-county-vow-v1",
  },
  iron: {
    idx: "iron-county-idx-v1",
    vow: "iron-county-vow-v1",
  },
} as const;

export type MlsScopeState = {
  key: `${MlsCounty}-${MlsRole}`;
  county: MlsCounty;
  countyLabel: string;
  role: MlsRole;
  approvalStatus: MlsApprovalStatus;
  explicitlyEnabled: boolean;
  policyApproved: boolean;
  providerConfigured: boolean;
  credentialsConfigured: boolean;
  active: boolean;
};

export type ActiveIdxSource = {
  county: MlsCounty;
  provider: string;
  apiBaseUrl: string;
  accessToken: string;
};

export type ActiveVowProvider = {
  county: MlsCounty;
  scopeKey: `${MlsCounty}-vow`;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  issuer: string;
  jwksUrl: string;
  userinfoUrl?: string;
  scopes: string;
  tokenAuthMethod: VowTokenAuthMethod;
  mlsId?: string;
  redirectUri: string;
  stateSecret: string;
  tokenEncryptionSecret: string;
};

const COUNTY_LABELS: Record<MlsCounty, string> = {
  washington: "Washington County",
  iron: "Iron County",
};

function prefix(county: MlsCounty, role: MlsRole) {
  return `${county.toUpperCase()}_${role.toUpperCase()}` as
    | "WASHINGTON_IDX"
    | "WASHINGTON_VOW"
    | "IRON_IDX"
    | "IRON_VOW";
}

function read(env: MlsScopeEnv, name: string) {
  return (env as Record<string, string | undefined>)[name]?.trim();
}

function approvalStatus(value: string | undefined): MlsApprovalStatus {
  switch (value?.trim().toLowerCase()) {
    case "pending":
    case "approved":
    case "denied":
    case "suspended":
      return value.trim().toLowerCase() as MlsApprovalStatus;
    default:
      return "not-requested";
  }
}

function hasHttpsUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function tokenAuthMethod(value: string | undefined): VowTokenAuthMethod {
  return value === "client_secret_basic" ? value : "client_secret_post";
}

export function getMlsScopeState(
  env: MlsScopeEnv,
  county: MlsCounty,
  role: MlsRole,
): MlsScopeState {
  const envPrefix = prefix(county, role);
  const status = approvalStatus(read(env, `${envPrefix}_APPROVAL_STATUS`));
  const explicitlyEnabled = read(env, `${envPrefix}_ENABLED`) === "true";
  const policyApproved =
    read(env, `${envPrefix}_POLICY_VERSION`) ===
    APPROVED_POLICY_VERSIONS[county][role];

  const providerConfigured =
    role === "idx"
      ? Boolean(read(env, `${envPrefix}_PROVIDER`))
      : hasHttpsUrl(read(env, `${envPrefix}_AUTHORIZATION_URL`)) &&
        hasHttpsUrl(read(env, `${envPrefix}_TOKEN_URL`)) &&
        hasHttpsUrl(read(env, `${envPrefix}_ISSUER`)) &&
        hasHttpsUrl(read(env, `${envPrefix}_JWKS_URL`));

  const credentialsConfigured =
    role === "idx"
      ? hasHttpsUrl(read(env, `${envPrefix}_API_BASE_URL`)) &&
        Boolean(read(env, `${envPrefix}_ACCESS_TOKEN`))
      : Boolean(
          read(env, `${envPrefix}_CLIENT_ID`) &&
            read(env, `${envPrefix}_CLIENT_SECRET`) &&
            hasHttpsUrl(env.VOW_REDIRECT_URI) &&
            env.VOW_STATE_SECRET?.trim() &&
            env.VOW_TOKEN_ENCRYPTION_SECRET?.trim(),
        );

  return {
    key: `${county}-${role}`,
    county,
    countyLabel: COUNTY_LABELS[county],
    role,
    approvalStatus: status,
    explicitlyEnabled,
    policyApproved,
    providerConfigured,
    credentialsConfigured,
    active:
      status === "approved" &&
      explicitlyEnabled &&
      policyApproved &&
      providerConfigured &&
      credentialsConfigured,
  };
}

export function getAllMlsScopeStates(env: MlsScopeEnv) {
  return MLS_COUNTIES.flatMap((county) =>
    MLS_ROLES.map((role) => getMlsScopeState(env, county, role)),
  );
}

export function getActiveIdxSource(
  env: MlsScopeEnv,
  county: MlsCounty,
): ActiveIdxSource | null {
  const state = getMlsScopeState(env, county, "idx");
  if (!state.active) return null;

  const envPrefix = prefix(county, "idx");
  return {
    county,
    provider: read(env, `${envPrefix}_PROVIDER`) as string,
    apiBaseUrl: read(env, `${envPrefix}_API_BASE_URL`) as string,
    accessToken: read(env, `${envPrefix}_ACCESS_TOKEN`) as string,
  };
}

export function getActiveVowProvider(
  env: MlsScopeEnv,
  county: MlsCounty,
): ActiveVowProvider | null {
  const state = getMlsScopeState(env, county, "vow");
  if (!state.active) return null;

  const envPrefix = prefix(county, "vow");
  const userinfoUrl = read(env, `${envPrefix}_USERINFO_URL`);
  return {
    county,
    scopeKey: `${county}-vow`,
    clientId: read(env, `${envPrefix}_CLIENT_ID`) as string,
    clientSecret: read(env, `${envPrefix}_CLIENT_SECRET`) as string,
    authorizationUrl: read(env, `${envPrefix}_AUTHORIZATION_URL`) as string,
    tokenUrl: read(env, `${envPrefix}_TOKEN_URL`) as string,
    issuer: read(env, `${envPrefix}_ISSUER`) as string,
    jwksUrl: read(env, `${envPrefix}_JWKS_URL`) as string,
    userinfoUrl: hasHttpsUrl(userinfoUrl) ? userinfoUrl : undefined,
    scopes: read(env, `${envPrefix}_SCOPES`) || "openid profile email",
    tokenAuthMethod: tokenAuthMethod(read(env, `${envPrefix}_TOKEN_AUTH_METHOD`)),
    mlsId: read(env, `${envPrefix}_MLS_ID`) || undefined,
    redirectUri: env.VOW_REDIRECT_URI?.trim() as string,
    stateSecret: env.VOW_STATE_SECRET?.trim() as string,
    tokenEncryptionSecret: env.VOW_TOKEN_ENCRYPTION_SECRET?.trim() as string,
  };
}

export function isMlsCounty(value: string | null | undefined): value is MlsCounty {
  return MLS_COUNTIES.includes(value as MlsCounty);
}
