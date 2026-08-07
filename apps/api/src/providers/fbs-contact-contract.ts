/**
 * Internal boundary between HomeInStGeorgeUtah.com and the eventual FBS
 * Contact/member-portal implementation.
 *
 * This is deliberately not an FBS wire-format client. PLAT-634 and the
 * remaining endpoint/payload questions must be resolved before an HTTP adapter
 * is permitted to translate this contract into provider requests.
 */

export const FBS_CONSUMER_CONTRACT_VERSION = "2026-08-06" as const;
export const FBS_DESIGNATED_MEMBER_LOGIN = "stg.joelg" as const;
export const FBS_VOW_CALLBACK_URI =
  "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback" as const;

export const FBS_VOW_SCOPE_KEYS = ["washington-vow", "iron-vow"] as const;
export type FbsVowScopeKey = (typeof FBS_VOW_SCOPE_KEYS)[number];

export type FbsContactProvisioningCommand = {
  contractVersion: typeof FBS_CONSUMER_CONTRACT_VERSION;
  correlationId: string;
  idempotencyKey: string;
  scopeKey: FbsVowScopeKey;
  designatedMemberLogin: typeof FBS_DESIGNATED_MEMBER_LOGIN;
  callbackUri: typeof FBS_VOW_CALLBACK_URI;
  consumer: {
    localAccountId: string;
    localContactId: string;
    email: string;
    givenName: string;
    familyName: string;
  };
  requestedCapabilities: {
    memberPortalAccess: true;
    savedSearches: true;
    consumerMayWriteContacts: false;
  };
};

export type FbsCredentialProvisioning = {
  owner: "fbs";
  mode:
    | "invitation"
    | "hosted-registration"
    | "magic-link"
    | "provider-defined";
  completionUrl?: string;
};

export type FbsContactProvisioningResult = {
  contractVersion: typeof FBS_CONSUMER_CONTRACT_VERSION;
  correlationId: string;
  state:
    | "contact-ready"
    | "consumer-action-required"
    | "provider-pending"
    | "provider-blocked";
  providerContactId?: string;
  authorizationReady: boolean;
  credentialProvisioning?: FbsCredentialProvisioning;
  providerTicket?: string;
};

export type FbsOidcStartDecision =
  | {
      allowed: true;
      providerContactId: string;
    }
  | {
      allowed: false;
      code:
        | "FBS_CONTACT_NOT_READY"
        | "FBS_CONSUMER_ACTION_REQUIRED"
        | "FBS_PROVIDER_PENDING"
        | "FBS_PROVIDER_BLOCKED";
    };

export interface FbsContactGateway {
  provisionContact(
    command: FbsContactProvisioningCommand,
  ): Promise<FbsContactProvisioningResult>;
}

export class FbsContractError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function required(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new FbsContractError(
      "FBS_CONTRACT_INVALID_INPUT",
      `${label} is required and must not exceed ${maxLength} characters.`,
    );
  }
  return normalized;
}

function normalizedEmail(value: string) {
  const email = required(value, "Consumer email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new FbsContractError(
      "FBS_CONTRACT_INVALID_EMAIL",
      "Consumer email must be a valid address.",
    );
  }
  return email;
}

function assertScopeKey(value: string): asserts value is FbsVowScopeKey {
  if (!FBS_VOW_SCOPE_KEYS.includes(value as FbsVowScopeKey)) {
    throw new FbsContractError(
      "FBS_CONTRACT_INVALID_SCOPE",
      "Scope must be washington-vow or iron-vow.",
    );
  }
}

function optionalHttpsUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    return url.toString();
  } catch {
    throw new FbsContractError(
      "FBS_CONTRACT_INVALID_URL",
      "Credential completion URL must use HTTPS.",
    );
  }
}

export function buildFbsContactProvisioningCommand(input: {
  correlationId: string;
  idempotencyKey: string;
  scopeKey: string;
  localAccountId: string;
  localContactId: string;
  email: string;
  givenName: string;
  familyName: string;
}): FbsContactProvisioningCommand {
  assertScopeKey(input.scopeKey);
  return {
    contractVersion: FBS_CONSUMER_CONTRACT_VERSION,
    correlationId: required(input.correlationId, "Correlation ID", 100),
    idempotencyKey: required(input.idempotencyKey, "Idempotency key", 160),
    scopeKey: input.scopeKey,
    designatedMemberLogin: FBS_DESIGNATED_MEMBER_LOGIN,
    callbackUri: FBS_VOW_CALLBACK_URI,
    consumer: {
      localAccountId: required(input.localAccountId, "Local account ID", 100),
      localContactId: required(input.localContactId, "Local contact ID", 100),
      email: normalizedEmail(input.email),
      givenName: required(input.givenName, "Given name", 100),
      familyName: required(input.familyName, "Family name", 100),
    },
    requestedCapabilities: {
      memberPortalAccess: true,
      savedSearches: true,
      consumerMayWriteContacts: false,
    },
  };
}

export function validateFbsContactProvisioningResult(
  command: FbsContactProvisioningCommand,
  result: FbsContactProvisioningResult,
) {
  if (result.contractVersion !== command.contractVersion) {
    throw new FbsContractError(
      "FBS_CONTRACT_VERSION_MISMATCH",
      "FBS provisioning response used an unsupported contract version.",
    );
  }
  if (result.correlationId !== command.correlationId) {
    throw new FbsContractError(
      "FBS_CORRELATION_MISMATCH",
      "FBS provisioning response did not match the originating request.",
    );
  }

  const providerContactId = result.providerContactId?.trim();
  if (result.authorizationReady) {
    if (result.state !== "contact-ready" || !providerContactId) {
      throw new FbsContractError(
        "FBS_AUTHORIZATION_READINESS_INVALID",
        "OIDC cannot start without a ready state and provider Contact ID.",
      );
    }
  } else if (result.state === "contact-ready") {
    throw new FbsContractError(
      "FBS_AUTHORIZATION_READINESS_INVALID",
      "A ready Contact must explicitly permit OIDC authorization.",
    );
  }

  if (result.state === "consumer-action-required" && !result.credentialProvisioning) {
    throw new FbsContractError(
      "FBS_CREDENTIAL_PROVISIONING_REQUIRED",
      "Consumer-action-required responses must describe the FBS-owned next step.",
    );
  }

  if (result.credentialProvisioning) {
    result.credentialProvisioning.completionUrl = optionalHttpsUrl(
      result.credentialProvisioning.completionUrl,
    );
  }
  return {
    ...result,
    providerContactId,
  };
}

export function decideFbsOidcStart(
  result: ReturnType<typeof validateFbsContactProvisioningResult>,
): FbsOidcStartDecision {
  if (result.authorizationReady && result.providerContactId) {
    return { allowed: true, providerContactId: result.providerContactId };
  }
  switch (result.state) {
    case "consumer-action-required":
      return { allowed: false, code: "FBS_CONSUMER_ACTION_REQUIRED" };
    case "provider-pending":
      return { allowed: false, code: "FBS_PROVIDER_PENDING" };
    case "provider-blocked":
      return { allowed: false, code: "FBS_PROVIDER_BLOCKED" };
    default:
      return { allowed: false, code: "FBS_CONTACT_NOT_READY" };
  }
}
