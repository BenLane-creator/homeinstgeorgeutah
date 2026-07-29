import { describe, expect, test } from "bun:test";
import {
  APPROVED_POLICY_VERSIONS,
  getActiveIdxSource,
  getActiveVowProvider,
  getAllMlsScopeStates,
  getMlsScopeState,
} from "./mls-scope-service";

describe("independent MLS scope activation", () => {
  test("records pending applications without activating data access", () => {
    const state = getMlsScopeState(
      {
        WASHINGTON_IDX_APPROVAL_STATUS: "pending",
        WASHINGTON_IDX_ENABLED: "true",
        WASHINGTON_IDX_POLICY_VERSION:
          APPROVED_POLICY_VERSIONS.washington.idx,
        WASHINGTON_IDX_PROVIDER: "spark-reso",
        WASHINGTON_IDX_API_BASE_URL: "https://example.com/reso",
        WASHINGTON_IDX_ACCESS_TOKEN: "secret",
      },
      "washington",
      "idx",
    );

    expect(state.approvalStatus).toBe("pending");
    expect(state.active).toBe(false);
  });

  test("requires approval, policy, provider, credentials, and explicit enablement", () => {
    const env = {
      IRON_IDX_APPROVAL_STATUS: "approved",
      IRON_IDX_ENABLED: "true",
      IRON_IDX_POLICY_VERSION: APPROVED_POLICY_VERSIONS.iron.idx,
      IRON_IDX_PROVIDER: "spark-reso",
      IRON_IDX_API_BASE_URL: "https://example.com/reso",
      IRON_IDX_ACCESS_TOKEN: "secret",
    };

    expect(getMlsScopeState(env, "iron", "idx").active).toBe(true);
    expect(getActiveIdxSource(env, "iron")).toMatchObject({
      county: "iron",
      provider: "spark-reso",
    });
    expect(getActiveIdxSource(env, "washington")).toBeNull();
  });

  test("never lets one county approval activate the other county", () => {
    const states = getAllMlsScopeStates({
      WASHINGTON_IDX_APPROVAL_STATUS: "approved",
      WASHINGTON_IDX_ENABLED: "true",
      WASHINGTON_IDX_POLICY_VERSION:
        APPROVED_POLICY_VERSIONS.washington.idx,
      WASHINGTON_IDX_PROVIDER: "spark-reso",
      WASHINGTON_IDX_API_BASE_URL: "https://example.com/reso",
      WASHINGTON_IDX_ACCESS_TOKEN: "secret",
    });

    expect(states.find((state) => state.key === "washington-idx")?.active).toBe(
      true,
    );
    expect(states.find((state) => state.key === "iron-idx")?.active).toBe(false);
    expect(states.find((state) => state.key === "washington-vow")?.active).toBe(
      false,
    );
  });

  test("requires verified OIDC endpoints and separate server-side VOW secrets", () => {
    const env = {
      WASHINGTON_VOW_APPROVAL_STATUS: "approved",
      WASHINGTON_VOW_ENABLED: "true",
      WASHINGTON_VOW_POLICY_VERSION:
        APPROVED_POLICY_VERSIONS.washington.vow,
      WASHINGTON_VOW_CLIENT_ID: "client",
      WASHINGTON_VOW_CLIENT_SECRET: "secret",
      WASHINGTON_VOW_AUTHORIZATION_URL: "https://id.example.com/authorize",
      WASHINGTON_VOW_TOKEN_URL: "https://id.example.com/token",
      WASHINGTON_VOW_ISSUER: "https://id.example.com",
      WASHINGTON_VOW_JWKS_URL: "https://id.example.com/.well-known/jwks.json",
      VOW_REDIRECT_URI:
        "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback",
      VOW_STATE_SECRET: "state-secret",
      VOW_TOKEN_ENCRYPTION_SECRET: "token-secret",
    };
    const state = getMlsScopeState(env, "washington", "vow");

    expect(state.active).toBe(true);
    expect(getActiveVowProvider(env, "washington")).toMatchObject({
      county: "washington",
      scopeKey: "washington-vow",
      issuer: "https://id.example.com",
      tokenAuthMethod: "client_secret_post",
    });
    expect(getActiveVowProvider(env, "iron")).toBeNull();
  });

  test("does not activate VOW without a signing-key endpoint", () => {
    const state = getMlsScopeState(
      {
        IRON_VOW_APPROVAL_STATUS: "approved",
        IRON_VOW_ENABLED: "true",
        IRON_VOW_POLICY_VERSION: APPROVED_POLICY_VERSIONS.iron.vow,
        IRON_VOW_CLIENT_ID: "client",
        IRON_VOW_CLIENT_SECRET: "secret",
        IRON_VOW_AUTHORIZATION_URL: "https://id.example.com/authorize",
        IRON_VOW_TOKEN_URL: "https://id.example.com/token",
        IRON_VOW_ISSUER: "https://id.example.com",
        VOW_REDIRECT_URI:
          "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback",
        VOW_STATE_SECRET: "state-secret",
        VOW_TOKEN_ENCRYPTION_SECRET: "token-secret",
      },
      "iron",
      "vow",
    );

    expect(state.providerConfigured).toBe(false);
    expect(state.active).toBe(false);
  });
});
