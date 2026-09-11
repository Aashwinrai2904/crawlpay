import {
  type PaymentProof,
  type PaymentRequirements,
  type VerificationResult,
  VerificationResultSchema,
} from "./x402";

const FACILITATOR_BASE_URL_ENV_VAR = "CRAWLPAY_FACILITATOR_URL";
const DEFAULT_FACILITATOR_BASE_URL = "http://localhost:4100";
const DEFAULT_TIMEOUT_MS = 2000;

export interface FacilitatorClientOptions {
  /** Defaults to CRAWLPAY_FACILITATOR_URL, then the local mock-facilitator. */
  baseUrl?: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * The contract callers actually depend on — lets server-side code (and
 * tests) inject anything that can verify a proof without depending on
 * FacilitatorClient's concrete (privately-fielded) shape.
 */
export interface PaymentVerifier {
  verify(proof: PaymentProof, requirements: PaymentRequirements): Promise<VerificationResult>;
}

/**
 * Talks to an x402 facilitator's /verify endpoint. Swappable between the
 * local mock-facilitator and a real facilitator (e.g. the public
 * https://x402.org/facilitator or Coinbase's) purely via
 * CRAWLPAY_FACILITATOR_URL or the baseUrl option — callers never need to
 * know which one they're hitting. A facilitator outage or timeout never
 * throws: it resolves to a VerificationResult with isValid:false and a
 * human-readable reason.
 *
 * Request/response shapes match x402 spec §7.1 exactly (see
 * docs/x402-CONFORMANCE.md) -- previously this sent `{ payload,
 * paymentRequirements }` with no `x402Version` and read back
 * `{ valid, amount, error }`, which a spec-compliant facilitator's real
 * `{ isValid, invalidReason, payer }` response would always fail to parse.
 */
export class FacilitatorClient implements PaymentVerifier {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FacilitatorClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ?? process.env[FACILITATOR_BASE_URL_ENV_VAR] ?? DEFAULT_FACILITATOR_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async verify(
    proof: PaymentProof,
    requirements: PaymentRequirements,
  ): Promise<VerificationResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          x402Version: proof.x402Version,
          paymentPayload: proof,
          paymentRequirements: requirements,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          isValid: false,
          invalidReason: `facilitator responded with status ${response.status}`,
        };
      }

      const parsed = VerificationResultSchema.safeParse(await response.json());
      if (!parsed.success) {
        return { isValid: false, invalidReason: "facilitator returned a malformed response" };
      }
      return parsed.data;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { isValid: false, invalidReason: "facilitator request timed out" };
      }
      return {
        isValid: false,
        invalidReason: err instanceof Error ? err.message : "facilitator request failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
