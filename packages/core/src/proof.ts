import { base64UrlDecode, findHeader } from "./utils";
import { type PaymentProof, PaymentProofSchema } from "./x402";

const PAYMENT_HEADER = "x-payment";

/**
 * Extracts and validates the proof-of-payment header from an incoming
 * retry request. Never throws — any malformation (missing header, bad
 * base64, bad JSON, schema mismatch) yields null, since this reads
 * untrusted client input.
 */
export function parsePaymentProof(headers: Record<string, string>): PaymentProof | null {
  const raw = findHeader(headers, PAYMENT_HEADER);
  if (!raw) {
    return null;
  }

  let decoded: string;
  try {
    decoded = base64UrlDecode(raw);
  } catch {
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(decoded);
  } catch {
    return null;
  }

  const result = PaymentProofSchema.safeParse(json);
  return result.success ? result.data : null;
}
