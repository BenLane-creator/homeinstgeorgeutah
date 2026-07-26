import { describe, expect, test } from "bun:test";
import {
  APPROVED_POLICY_VERSIONS,
  getActiveIdxSource,
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

  test("requires server-side VOW credentials and HTTPS endpoints", () => {
    const state = getMlsScopeState(
      {
        WASHINGTON_VOW_APPROVAL_STATUS: "approved",
        WASHINGTON_VOW_ENABLED: "true",
        WASHINGTON_VOW_POLICY_VERSION:
          APPROVED_POLICY_VERSIONS.washington.vow,
        WASHINGTON_VOW_CLIENT_ID: "client",
        WASHINGTON_VOW_CLIENT_SECRET: "secret",
        WASHINGTON_VOW_AUTHORIZATION_URL:
          "https://sparkplatform.com/auth/vow",
        WASHINGTON_VOW_TOKEN_URL: "https://sparkplatform.com/openid/token",
        VOW_REDIRECT_URI:
          "https://homeinstgeorgeutah.com/api/v1/auth/flexmls/callback",
        VOW_STATE_SECRET: "state-secret",
      },
      "washington",
      "vow",
    );

    expect(state.active).toBe(true);
  });
});
