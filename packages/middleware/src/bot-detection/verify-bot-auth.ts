import { createPublicKey, verify as verifyEd25519 } from "node:crypto";
import { findHeader } from "@crawlpay/core";
import { z } from "zod";
import { InMemoryJwksCache, type JwksCache } from "./jwks-cache";
import { computeEd25519Thumbprint, isEd25519Jwk } from "./jwks-thumbprint";
import {
  SignatureBaseError,
  buildSignatureBase,
  extractSignatureLabel,
  parseSignatureBytes,
  parseSignatureInput,
} from "./signature-base";
import type { BotAuthVerifyRequest, BotAuthVerifyResult } from "./types";

/**
 * SECURITY-SENSITIVE: this implements cryptographic signature verification.
 * Must be reviewed by a security engineer before production use — do not
 * deploy on the basis of AI-generated code alone.
 *
 * Known gaps a reviewer should specifically check before this guards
 * anything:
 *  - `signature-agent` is client-supplied and is fetched as-is (this is the
 *    JWKS directory URL). That's a real SSRF surface — production needs an
 *    allowlist and/or DNS-rebinding protection before this fetch is trusted.
 *  - The JWKS directory response itself is not verified as signed (Web Bot
 *    Auth expects the directory response to be signed so it can't be
 *    mirrored under someone else's identity); this implementation only
 *    checks the individual key's thumbprint against the requested keyid.
 *  - Structured-field parsing here is a scoped subset of RFC 8941/9421
 *    (single signature label, no `;req`/`sf`/`key`/`bs` component
 *    parameters) — see signature-base.ts.
 *  - `body`/content-digest verification is not implemented.
 */

const SUPPORTED_ALG = "ed25519";
const DEFAULT_JWKS_CACHE_TTL_SECONDS = 3600;
const MAX_SIGNATURE_AGE_SECONDS = 300;

const JwksDocumentSchema = z.object({
  keys: z.array(z.record(z.unknown())),
});

export interface VerifyBotAuthSignatureOptions {
  jwksCache?: JwksCache;
  fetchImpl?: typeof fetch;
  /** Injectable clock (seconds since epoch), for deterministic tests. */
  now?: () => number;
}

export async function verifyBotAuthSignature(
  request: BotAuthVerifyRequest,
  options: VerifyBotAuthSignatureOptions = {},
): Promise<BotAuthVerifyResult> {
  const jwksCache = options.jwksCache ?? new InMemoryJwksCache();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  const signatureInputHeader = findHeader(request.headers, "signature-input");
  const signatureHeader = findHeader(request.headers, "signature");
  if (!signatureInputHeader || !signatureHeader) {
    return { verified: false, reason: "missing Signature-Input or Signature header" };
  }

  const label = extractSignatureLabel(signatureInputHeader);
  if (!label) {
    return { verified: false, reason: "malformed Signature-Input header" };
  }

  const parsedInput = parseSignatureInput(signatureInputHeader, label);
  if (!parsedInput) {
    return { verified: false, reason: "malformed Signature-Input header" };
  }
  const { componentIds, params, rawParams } = parsedInput;

  const alg = typeof params.alg === "string" ? params.alg.toLowerCase() : undefined;
  if (alg !== SUPPORTED_ALG) {
    return { verified: false, reason: `unsupported or missing algorithm: ${alg ?? "none"}` };
  }

  const keyId = typeof params.keyid === "string" ? params.keyid : undefined;
  if (!keyId) {
    return { verified: false, reason: "missing keyid parameter" };
  }

  const created = typeof params.created === "number" ? params.created : undefined;
  if (created !== undefined) {
    const age = now() - created;
    if (age > MAX_SIGNATURE_AGE_SECONDS) {
      return { verified: false, keyId, reason: "signature is too old" };
    }
    if (age < -MAX_SIGNATURE_AGE_SECONDS) {
      return { verified: false, keyId, reason: "signature created timestamp is in the future" };
    }
  }
  const expires = typeof params.expires === "number" ? params.expires : undefined;
  if (expires !== undefined && now() > expires) {
    return { verified: false, keyId, reason: "signature has expired" };
  }

  if (!componentIds.includes("signature-agent")) {
    return { verified: false, keyId, reason: "signature-agent must be a covered component" };
  }
  const signatureAgent = findHeader(request.headers, "signature-agent");
  if (!signatureAgent) {
    return { verified: false, keyId, reason: "missing signature-agent header" };
  }

  let jwksUrl: URL;
  try {
    jwksUrl = new URL(stripQuotes(signatureAgent));
  } catch {
    return { verified: false, keyId, reason: "signature-agent is not a valid URL" };
  }
  if (jwksUrl.protocol !== "https:") {
    return { verified: false, keyId, reason: "signature-agent must be an https URL" };
  }

  let jwk = await jwksCache.get(keyId);
  if (!jwk) {
    const fetched = await fetchJwkByThumbprint(fetchImpl, jwksUrl, keyId);
    if (!fetched) {
      return { verified: false, keyId, reason: "public key not found in signer's JWKS directory" };
    }
    jwk = fetched;
    await jwksCache.set(keyId, jwk, DEFAULT_JWKS_CACHE_TTL_SECONDS);
  }

  let signatureBase: string;
  try {
    signatureBase = buildSignatureBase(componentIds, request, rawParams);
  } catch (err) {
    if (err instanceof SignatureBaseError) {
      return { verified: false, keyId, reason: err.message };
    }
    throw err;
  }

  const signatureBytes = parseSignatureBytes(signatureHeader, label);
  if (!signatureBytes) {
    return { verified: false, keyId, reason: "malformed Signature header" };
  }

  try {
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const isValid = verifyEd25519(
      null,
      Buffer.from(signatureBase, "utf8"),
      publicKey,
      signatureBytes,
    );
    return isValid
      ? { verified: true, keyId }
      : { verified: false, keyId, reason: "signature does not match" };
  } catch (err) {
    return {
      verified: false,
      keyId,
      reason: err instanceof Error ? err.message : "signature verification failed",
    };
  }
}

/**
 * Fetches the signer's JWKS document and returns whichever key's own
 * RFC 7638 thumbprint equals `keyId` — per Web Bot Auth, keyid IS the
 * thumbprint, so a key's identity isn't taken from a self-declared `kid`
 * field.
 */
async function fetchJwkByThumbprint(fetchImpl: typeof fetch, jwksUrl: URL, keyId: string) {
  let response: Response;
  try {
    response = await fetchImpl(jwksUrl.toString());
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const parsed = JwksDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }

  for (const key of parsed.data.keys) {
    if (isEd25519Jwk(key) && computeEd25519Thumbprint(key) === keyId) {
      return key;
    }
  }
  return null;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
