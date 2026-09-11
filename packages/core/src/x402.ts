import { z } from "zod";

/**
 * Wire-format schemas for the x402 payment handshake (HTTP 402 Payment
 * Required, with a machine-readable payment manifest in the response body
 * and a proof-of-payment header on retry).
 *
 * PHASE 4 FIX (see docs/x402-CONFORMANCE.md for the conformance testing that
 * found the gaps this closes): the wire shapes below now match the x402
 * spec (specs/x402-specification-v1.md) and x402@1.2.0's zod schemas
 * exactly for the "exact" scheme on EVM networks:
 *  - PaymentRequirements no longer carries a crawlpay-only `nonce` field.
 *  - PaymentProof ("PaymentPayload" in spec terms) now carries a real
 *    EIP-3009 `{ signature, authorization }` payload instead of an opaque
 *    Record<string, unknown> -- see ExactEvmPaymentPayloadSchema below.
 *  - VerificationResult now matches the spec facilitator /verify response
 *    (`isValid` / `invalidReason`) instead of the ad hoc `valid` / `error`
 *    this repo invented before checking the spec.
 *
 * Anti-replay: crawlpay's own single-use check (InMemoryNonceStore) now
 * keys off `payload.authorization.nonce` -- the EIP-3009 nonce the client
 * already has to generate and sign as part of the authorization -- rather
 * than a separate token this server used to mint and require the client to
 * echo back outside the signed payload.
 */

export const PaymentRequirementsSchema = z.object({
  scheme: z.literal("exact"),
  network: z.string(),
  /** Price, as a decimal string of atomic units of `asset` (spec: maxAmountRequired). */
  maxAmountRequired: z.string(),
  /** URL of the resource being paid for. */
  resource: z.string(),
  description: z.string().default(""),
  mimeType: z.string().default("application/json"),
  /** Recipient address. */
  payTo: z.string(),
  /** Payment timeout, in seconds. */
  maxTimeoutSeconds: z.number().int().positive(),
  /** Asset/currency identifier (e.g. a token contract address or symbol). */
  asset: z.string(),
  extra: z.record(z.unknown()).optional(),
});
export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

export const Http402ResponseBodySchema = z.object({
  x402Version: z.number().int(),
  error: z.string().optional(),
  accepts: z.array(PaymentRequirementsSchema),
});
export type Http402ResponseBody = z.infer<typeof Http402ResponseBodySchema>;

/**
 * EIP-3009 `transferWithAuthorization` parameters (x402 spec §5.2, §6.1.1):
 * the client mints its own `nonce` (a bytes32 it controls) as part of what
 * it signs -- it is not something the server hands out.
 */
export const ExactEvmAuthorizationSchema = z.object({
  from: z.string(),
  to: z.string(),
  value: z.string(),
  validAfter: z.string(),
  validBefore: z.string(),
  nonce: z.string(),
});
export type ExactEvmAuthorization = z.infer<typeof ExactEvmAuthorizationSchema>;

/** The "exact" scheme's SchemePayload for EVM networks (spec §5.2, §6.1). */
export const ExactEvmPaymentPayloadSchema = z.object({
  signature: z.string(),
  authorization: ExactEvmAuthorizationSchema,
});
export type ExactEvmPaymentPayload = z.infer<typeof ExactEvmPaymentPayloadSchema>;

/**
 * Wire-identical to the x402 spec's PaymentPayload. Kept named
 * `PaymentProof` (crawlpay's pre-existing name for "what a retrying client
 * sends in X-Payment") rather than renamed, to limit the blast radius of
 * this fix -- the shape, not the name, is what needed to match the spec.
 */
export const PaymentProofSchema = z.object({
  x402Version: z.number().int(),
  scheme: z.literal("exact"),
  network: z.string(),
  payload: ExactEvmPaymentPayloadSchema,
});
export type PaymentProof = z.infer<typeof PaymentProofSchema>;

/**
 * Shape of a facilitator's POST /verify response (spec §7.1). Renamed from
 * this repo's original ad hoc `{ valid, amount, error }` to the spec's
 * `{ isValid, invalidReason, payer }` -- the original shape silently
 * rejected every response from a real facilitator (see
 * docs/x402-CONFORMANCE.md §4.3).
 */
export const VerificationResultSchema = z.object({
  isValid: z.boolean(),
  invalidReason: z.string().optional(),
  payer: z.string().optional(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
