import { randomUUID } from "node:crypto";
import { build402Response, type PaymentRequirements } from "@crawlpay/core";
import type { FastifyReply } from "fastify";
import type { PricingConfig } from "./config/publisher-config";

/** Identical wording regardless of why payment is required — a specific reason would leak state to the caller. */
const GENERIC_PAYMENT_MESSAGE = "Payment required for this resource.";

export function buildPaymentRequirements(
  resourceUrl: string,
  pricing: PricingConfig,
  nonce: string = randomUUID(),
): PaymentRequirements {
  return {
    scheme: "exact",
    network: pricing.network,
    maxAmountRequired: pricing.maxAmountRequired,
    resource: resourceUrl,
    description: `Access to ${resourceUrl}`,
    mimeType: "text/html",
    payTo: pricing.payTo,
    maxTimeoutSeconds: pricing.maxTimeoutSeconds,
    asset: pricing.asset,
    nonce,
  };
}

/** Always mints a fresh nonce — every 402, regardless of cause, is a clean invitation to retry. */
export function respondWithPaymentRequired(
  reply: FastifyReply,
  resourceUrl: string,
  pricing: PricingConfig,
): unknown {
  const requirements = buildPaymentRequirements(resourceUrl, pricing);
  const response = build402Response(requirements);
  response.body.error = GENERIC_PAYMENT_MESSAGE;

  for (const [key, value] of Object.entries(response.headers)) {
    reply.header(key, value);
  }
  reply.code(response.status);
  return response.body;
}
