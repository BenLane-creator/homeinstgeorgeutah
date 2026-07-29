import { describe, expect, test } from "bun:test";
import {
  createPkcePair,
  decryptString,
  encryptString,
  sha256,
  signHmac,
  verifyHmac,
} from "./crypto";

describe("crypto utilities", () => {
  test("encrypts and decrypts provider secrets without exposing plaintext", async () => {
    const encrypted = await encryptString("encryption-secret", "provider-token");
    expect(encrypted).toStartWith("v1.");
    expect(encrypted).not.toContain("provider-token");
    expect(await decryptString("encryption-secret", encrypted)).toBe(
      "provider-token",
    );
  });

  test("signs and verifies authorization state", async () => {
    const signature = await signHmac("state-secret", "state-payload");
    expect(await verifyHmac("state-secret", "state-payload", signature)).toBe(
      true,
    );
    expect(await verifyHmac("state-secret", "tampered", signature)).toBe(false);
  });

  test("builds an S256 PKCE pair", async () => {
    const pair = await createPkcePair();
    expect(pair.verifier.length).toBeGreaterThan(43);
    expect(pair.challenge).toBe(await sha256(pair.verifier));
    expect(pair.challenge).not.toBe(pair.verifier);
  });
});
