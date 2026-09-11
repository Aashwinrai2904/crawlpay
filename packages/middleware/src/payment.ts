import { build402Response, type Http402Response, type PaymentRequirements } from "@crawlpay/core";
import type { FastifyReply } from "fastify";
import type { PricingConfig } from "./config/publisher-config";

/** Identical wording regardless of why payment is required — a specific reason would leak state to the caller. */
const GENERIC_PAYMENT_MESSAGE = "Payment required for this resource.";

/**
 * PaymentRequirements no longer carries a nonce (see docs/x402-CONFORMANCE.md
 * and packages/core/src/x402.ts): anti-replay now keys off the client's own
 * EIP-3009 authorization.nonce inside the payment payload, so this is a
 * pure, deterministic function of (resourceUrl, pricing) again.
 */
export function buildPaymentRequirements(
  resourceUrl: string,
  pricing: PricingConfig,
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
  };
}

export function buildFreshPaymentRequiredResponse(
  resourceUrl: string,
  pricing: PricingConfig,
): Http402Response {
  const requirements = buildPaymentRequirements(resourceUrl, pricing);
  const response = build402Response(requirements);
  response.body.error = GENERIC_PAYMENT_MESSAGE;
  return response;
}

export function respondWithPaymentRequired(
  reply: FastifyReply,
  resourceUrl: string,
  pricing: PricingConfig,
): unknown {
  const response = buildFreshPaymentRequiredResponse(resourceUrl, pricing);

  for (const [key, value] of Object.entries(response.headers)) {
    reply.header(key, value);
  }
  reply.code(response.status);
  return response.body;
}
