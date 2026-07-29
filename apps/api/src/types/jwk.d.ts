export {};

declare global {
  interface JsonWebKey {
    kid?: string;
  }
}
