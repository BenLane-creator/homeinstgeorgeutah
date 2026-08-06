import { describe, expect, test } from "bun:test";
import {
  buildFbsContactProvisioningCommand,
  decideFbsOidcStart,
  FbsContractError,
  validateFbsContactProvisioningResult,
} from "./fbs-contact-contract";

function command() {
  return buildFbsContactProvisioningCommand({
    correlationId: "registration-01",
    idempotencyKey: "contact:local-contact-01:washington-vow",
    scopeKey: "washington-vow",
    localAccountId: "local-account-01",
    localContactId: "local-contact-01",
    email: "Consumer@Example.com",
    givenName: "Consumer",
    familyName: "Example",
  });
}

describe("FBS Contact provisioning contract", () => {
  test("normalizes our input and fixes the designated member and callback", () => {
    const value = command();
    expect(value.consumer.email).toBe("consumer@example.com");
    expect(value.designatedMemberLogin).toBe("stg.joelg");
    expect(value.callbackUri).toBe(
      "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback",
    );
    expect(value.requestedCapabilities).toEqual({
      memberPortalAccess: true,
      savedSearches: true,
      consumerMayWriteContacts: false,
    });
  });

  test("permits OIDC only after FBS returns the linked Contact as ready", () => {
    const request = command();
    const result = validateFbsContactProvisioningResult(request, {
      contractVersion: request.contractVersion,
      correlationId: request.correlationId,
      state: "contact-ready",
      providerContactId: "fbs-contact-123",
      authorizationReady: true,
    });
    expect(decideFbsOidcStart(result)).toEqual({
      allowed: true,
      providerContactId: "fbs-contact-123",
    });
  });

  test("keeps PLAT-634 and other provider blocks fail-closed", () => {
    const request = command();
    const result = validateFbsContactProvisioningResult(request, {
      contractVersion: request.contractVersion,
      correlationId: request.correlationId,
      state: "provider-blocked",
      authorizationReady: false,
      providerTicket: "PLAT-634",
    });
    expect(decideFbsOidcStart(result)).toEqual({
      allowed: false,
      code: "FBS_PROVIDER_BLOCKED",
    });
  });

  test("requires FBS-owned instructions when consumer action is needed", () => {
    const request = command();
    expect(() =>
      validateFbsContactProvisioningResult(request, {
        contractVersion: request.contractVersion,
        correlationId: request.correlationId,
        state: "consumer-action-required",
        authorizationReady: false,
      }),
    ).toThrow(FbsContractError);
  });

  test("rejects correlation mismatches and invalid ready responses", () => {
    const request = command();
    expect(() =>
      validateFbsContactProvisioningResult(request, {
        contractVersion: request.contractVersion,
        correlationId: "different-registration",
        state: "contact-ready",
        authorizationReady: true,
      }),
    ).toThrow("did not match the originating request");
  });
});
