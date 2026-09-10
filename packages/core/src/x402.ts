import { z } from "zod";

/**
 * Wire-format schemas for the x402 payment handshake (HTTP 402 Payment
 * Required, with a machine-readable payment manifest in the response body
 * and a proof-of-payment header on retry).
 *
 * CONFORMANCE (see docs/x402-CONFORMANCE.md for the full field-by-field
 * comparison against x402@1.2.0 and the live base-sepolia facilitator):
 *  - The 402 body (PaymentRequirementsResponse / PaymentRequirements) is
 *    close to spec-compliant -- a real x402 client parses it -- apart from
 *    the extra top-level `nonce` below, `asset` being a symbol rather than
 *    a token contract address, and a missing `extra` (EIP-712 domain).
 *  - PaymentProofSchema, and the facilitator /verify request/response
 *    shapes in facilitator-client.ts, are a mock-only stub and do NOT
 *    match the spec (no signature / EIP-3009 authorization; `payload` vs
 *    `paymentPayload`; `valid` vs `isValid`). They only interoperate with
 *    infra/mock-facilitator, not a spec-compliant facilitator.
 *
 * `nonce` is the one crawlpay-specific addition to PaymentRequirements: a
 * single-use token our own NonceStore enforces, separate from the spec's
 * in-payload EIP-3009 `authorization.nonce`.
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
  /** crawlpay anti-replay token; the payer must echo it back in PaymentProof. */
  nonce: z.string(),
  extra: z.record(z.unknown()).optional(),
});
export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

export const Http402ResponseBodySchema = z.object({
  x402Version: z.number().int(),
  error: z.string().optional(),
  accepts: z.array(PaymentRequirementsSchema),
});
export type Http402ResponseBody = z.infer<typeof Http402ResponseBodySchema>;

export const PaymentProofSchema = z.object({
  x402Version: z.number().int(),
  scheme: z.literal("exact"),
  network: z.string(),
  /** Echoes the PaymentRequirements.nonce this proof is paying against. */
  nonce: z.string(),
  /** Scheme-specific payload (e.g. an EIP-3009 authorization + signature). Opaque until Phase 2. */
  payload: z.record(z.unknown()),
});
export type PaymentProof = z.infer<typeof PaymentProofSchema>;

export const VerificationResultSchema = z.object({
  valid: z.boolean(),
  amount: z.string().optional(),
  payer: z.string().optional(),
  error: z.string().optional(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
