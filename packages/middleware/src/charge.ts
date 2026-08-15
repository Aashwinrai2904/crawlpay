import {
  parsePaymentProof,
  type Http402Response,
  type NonceStore,
  type PaymentRequirements,
  type PaymentVerifier,
  type VerificationResult,
} from "@crawlpay/core";
import { buildFreshPaymentRequiredResponse, buildPaymentRequirements } from "./payment";
import type { PricingConfig } from "./config/publisher-config";

export type ChargeOutcome = "no-proof" | "invalid-nonce" | "verification-failed" | "paid";

export type ChargeDecision =
  | { outcome: "no-proof" | "invalid-nonce" | "verification-failed"; response: Http402Response }
  | { outcome: "paid"; verification: VerificationResult; requirements: PaymentRequirements };

export interface ChargeDeps {
  nonceStore: NonceStore;
  facilitatorClient: PaymentVerifier;
  pricing: PricingConfig;
}

/**
 * The single implementation of "does this request satisfy the charge
 * policy for this resource" — shared by the main reverse-proxy route and
 * the /verify-and-price endpoint Mode B (the WordPress plugin's PHP-side
 * fallback) calls out to, so the two can't drift out of sync with each
 * other.
 *
 * `paymentProofHeaderValue` is the raw X-Payment header value (already
 * base64url-encoded JSON), not a parsed object — callers just forward
 * whatever they received.
 */
export async function resolveCharge(
  resourceUrl: string,
  paymentProofHeaderValue: string | undefined,
  deps: ChargeDeps,
): Promise<ChargeDecision> {
  const proof = paymentProofHeaderValue
    ? parsePaymentProof({ "x-payment": paymentProofHeaderValue })
    : null;

  if (!proof) {
    return {
      outcome: "no-proof",
      response: buildFreshPaymentRequiredResponse(resourceUrl, deps.pricing),
    };
  }

  const nonceIsFresh = await deps.nonceStore.consume(proof.nonce);
  if (!nonceIsFresh) {
    return {
      outcome: "invalid-nonce",
      response: buildFreshPaymentRequiredResponse(resourceUrl, deps.pricing),
    };
  }

  const requirements = buildPaymentRequirements(resourceUrl, deps.pricing, proof.nonce);
  const verification = await deps.facilitatorClient.verify(proof, requirements);

  if (!verification.valid) {
    return {
      outcome: "verification-failed",
      response: buildFreshPaymentRequiredResponse(resourceUrl, deps.pricing),
    };
  }

  return { outcome: "paid", verification, requirements };
}
