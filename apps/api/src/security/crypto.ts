const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(value: ArrayBuffer | Uint8Array) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export function base64UrlEncode(value: ArrayBuffer | Uint8Array) {
  let binary = "";
  for (const byte of bytes(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(byteLength = 32) {
  const value = new Uint8Array(byteLength);
  crypto.getRandomValues(value);
  return base64UrlEncode(value);
}

export async function sha256(value: string) {
  return base64UrlEncode(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signHmac(secret: string, value: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(value),
  );
  return base64UrlEncode(signature);
}

export async function verifyHmac(secret: string, value: string, signature: string) {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      base64UrlDecode(signature),
      encoder.encode(value),
    );
  } catch {
    return false;
  }
}

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptString(secret: string, plaintext: string) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    encoder.encode(plaintext),
  );
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(ciphertext)}`;
}

export async function decryptString(secret: string, value: string) {
  const [version, encodedIv, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) {
    throw new Error("Encrypted value has an unsupported format.");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(encodedIv) },
    await encryptionKey(secret),
    base64UrlDecode(encodedCiphertext),
  );
  return decoder.decode(plaintext);
}

export async function createPkcePair() {
  const verifier = randomToken(48);
  return {
    verifier,
    challenge: await sha256(verifier),
  };
}

export function parseJsonBase64Url<T>(value: string) {
  return JSON.parse(decoder.decode(base64UrlDecode(value))) as T;
}

export function encodeJsonBase64Url(value: unknown) {
  return base64UrlEncode(encoder.encode(JSON.stringify(value)));
}
