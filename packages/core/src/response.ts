import {
  type Http402ResponseBody,
  type PaymentRequirements,
  PaymentRequirementsSchema,
} from "./x402";

export interface Http402Response {
  status: 402;
  headers: Record<string, string>;
  body: Http402ResponseBody;
}

/**
 * Builds a spec-compliant 402 response for a single set of requirements.
 * `requirements` must already carry the nonce the caller registered with a
 * NonceStore — this function is a pure formatter, it does not mint nonces
 * or talk to anything.
 */
export function build402Response(requirements: PaymentRequirements): Http402Response {
  const validated = PaymentRequirementsSchema.parse(requirements);

  return {
    status: 402,
    headers: { "content-type": "application/json" },
    body: {
      x402Version: 1,
      accepts: [validated],
    },
  };
}
