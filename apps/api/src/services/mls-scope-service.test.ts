import { describe, expect, test } from "bun:test";
import {
  APPROVED_POLICY_VERSIONS,
  getActiveIdxSource,
  getActiveVowSource,
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

  test("requires every server-side VOW endpoint, credential, and encryption boundary", () => {
    const env = {
      WASHINGTON_VOW_APPROVAL_STATUS: "approved",
      WASHINGTON_VOW_ENABLED: "true",
      WASHINGTON_VOW_POLICY_VERSION:
        APPROVED_POLICY_VERSIONS.washington.vow,
      WASHINGTON_VOW_CLIENT_ID: "client",
      WASHINGTON_VOW_CLIENT_SECRET: "secret",
      WASHINGTON_VOW_AUTHORIZATION_URL:
        "https://sparkplatform.com/auth/vow",
      WASHINGTON_VOW_TOKEN_URL: "https://sparkapi.com/v1/oauth2/grant",
      WASHINGTON_VOW_CONTACT_URL: "https://sparkapi.com/v1/my/contact",
      WASHINGTON_VOW_MLS_ID: "washington-mls",
      VOW_REDIRECT_URI:
        "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback",
      VOW_STATE_SECRET: "state-secret-state-secret-state-secret",
      VOW_TOKEN_ENCRYPTION_KEY:
        "token-encryption-key-token-encryption-key",
    };

    expect(getMlsScopeState(env, "washington", "vow").active).toBe(true);
    expect(getActiveVowSource(env, "washington")).toMatchObject({
      county: "washington",
      scopeKey: "washington-vow",
      tokenUrl: "https://sparkapi.com/v1/oauth2/grant",
      contactUrl: "https://sparkapi.com/v1/my/contact",
      mlsId: "washington-mls",
    });
    expect(getActiveVowSource(env, "iron")).toBeNull();
  });

  test("keeps VOW inactive when the contact endpoint or encryption key is absent", () => {
    const base = {
      IRON_VOW_APPROVAL_STATUS: "approved",
      IRON_VOW_ENABLED: "true",
      IRON_VOW_POLICY_VERSION: APPROVED_POLICY_VERSIONS.iron.vow,
      IRON_VOW_CLIENT_ID: "client",
      IRON_VOW_CLIENT_SECRET: "secret",
      IRON_VOW_AUTHORIZATION_URL: "https://sparkplatform.com/auth/vow",
      IRON_VOW_TOKEN_URL: "https://sparkapi.com/v1/oauth2/grant",
      VOW_REDIRECT_URI:
        "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback",
      VOW_STATE_SECRET: "state-secret-state-secret-state-secret",
    };
    expect(getMlsScopeState(base, "iron", "vow").active).toBe(false);
    expect(
      getMlsScopeState(
        {
          ...base,
          IRON_VOW_CONTACT_URL: "https://sparkapi.com/v1/my/contact",
        },
        "iron",
        "vow",
      ).active,
    ).toBe(false);
  });
});
