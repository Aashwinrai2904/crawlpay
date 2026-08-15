import { createHash } from "node:crypto";

export interface Ed25519Jwk {
  kty: string;
  crv: string;
  x: string;
  // Index signature so this structurally satisfies Node's crypto.JsonWebKey
  // (createPublicKey({ key, format: "jwk" })) without a cast at the call site.
  [key: string]: unknown;
}

/**
 * RFC 7638 JSON Web Key Thumbprint for an OKP (Ed25519) key: SHA-256 over
 * the canonical JSON of exactly the required members, in lexicographic key
 * order, no whitespace. This is what Web Bot Auth uses as `keyid`.
 */
export function computeEd25519Thumbprint(jwk: Ed25519Jwk): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return createHash("sha256").update(canonical, "utf8").digest("base64url");
}

export function isEd25519Jwk(value: unknown): value is Ed25519Jwk {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.kty === "OKP" && candidate.crv === "Ed25519" && typeof candidate.x === "string";
}
