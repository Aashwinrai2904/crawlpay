import { z } from "zod";

/**
 * Shapes reflect the public x402 protocol (HTTP 402 Payment Required over
 * the X-PAYMENT / X-PAYMENT-RESPONSE headers). No settlement logic lives here —
 * this package only defines the wire format shared by middleware and dashboard.
 */

export const X402PaymentRequirementsSchema = z.object({
  scheme: z.literal("exact"),
  network: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string(),
  description: z.string(),
  mimeType: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().int().positive(),
  asset: z.string(),
  extra: z.record(z.unknown()).optional(),
});
export type X402PaymentRequirements = z.infer<typeof X402PaymentRequirementsSchema>;

export const X402PaymentRequiredResponseSchema = z.object({
  x402Version: z.number().int(),
  error: z.string().optional(),
  accepts: z.array(X402PaymentRequirementsSchema),
});
export type X402PaymentRequiredResponse = z.infer<typeof X402PaymentRequiredResponseSchema>;

export const X402PaymentPayloadSchema = z.object({
  x402Version: z.number().int(),
  scheme: z.literal("exact"),
  network: z.string(),
  payload: z.record(z.unknown()),
});
export type X402PaymentPayload = z.infer<typeof X402PaymentPayloadSchema>;

export const X402VerifyResponseSchema = z.object({
  valid: z.boolean(),
  amount: z.string().optional(),
  payer: z.string().optional(),
  error: z.string().optional(),
});
export type X402VerifyResponse = z.infer<typeof X402VerifyResponseSchema>;
