import { describe, expect, it } from "vitest";
import { FacilitatorClient } from "./facilitator-client";
import type { PaymentProof, PaymentRequirements } from "./x402";

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "10000",
  resource: "https://example.com/premium-article",
  description: "Premium article",
  mimeType: "text/html",
  payTo: "0xPUBLISHER00000000000000000000000000000",
  maxTimeoutSeconds: 60,
  asset: "USDC",
  nonce: "test-nonce",
};

const proof: PaymentProof = {
  x402Version: 1,
  scheme: "exact",
  network: "base-sepolia",
  nonce: "test-nonce",
  payload: {},
};

describe("FacilitatorClient.verify", () => {
  it("returns the facilitator's verification result on success", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ valid: true, amount: "10000", payer: "0xabc" }), {
        status: 200,
      })) as typeof fetch;

    const client = new FacilitatorClient({ fetchImpl });
    const result = await client.verify(proof, requirements);

    expect(result).toEqual({ valid: true, amount: "10000", payer: "0xabc" });
  });

  it("resolves with valid:false instead of throwing when the facilitator times out", async () => {
    const hangingFetch = ((_input: unknown, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as typeof fetch;

    const client = new FacilitatorClient({ fetchImpl: hangingFetch, timeoutMs: 20 });
    const result = await client.verify(proof, requirements);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/timed out/i);
  });

  it("resolves with valid:false when the network call rejects outright", async () => {
    const failingFetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const client = new FacilitatorClient({ fetchImpl: failingFetch });
    const result = await client.verify(proof, requirements);

    expect(result).toEqual({ valid: false, error: "ECONNREFUSED" });
  });
});
