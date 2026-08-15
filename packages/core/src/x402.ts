import { z } from "zod";

/**
 * Wire-format schemas for the x402 payment handshake (HTTP 402 Payment
 * Required, with a machine-readable payment manifest in the response body
 * and a proof-of-payment header on retry). Field names follow the public
 * x402 spec (https://www.x402.org/) so a real facilitator or client can
 * speak this without translation. `nonce` is the one crawlpay-specific
 * addition: a single-use token our own NonceStore enforces, independent of
 * whatever replay protection the eventual "exact" scheme signature carries.
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
