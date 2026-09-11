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
};

const proof: PaymentProof = {
  x402Version: 1,
  scheme: "exact",
  network: "base-sepolia",
  payload: {
    signature: "0x" + "ab".repeat(65),
    authorization: {
      from: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      to: "0xPUBLISHER00000000000000000000000000000",
      value: "10000",
      validAfter: "0",
      validBefore: "9999999999",
      nonce: "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480",
    },
  },
};

describe("FacilitatorClient.verify", () => {
  it("POSTs the spec-shaped request body (x402Version, paymentPayload, paymentRequirements)", async () => {
    let sentBody: unknown;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      sentBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ isValid: true, payer: "0xabc" }), { status: 200 });
    }) as typeof fetch;

    const client = new FacilitatorClient({ fetchImpl });
    await client.verify(proof, requirements);

    expect(sentBody).toEqual({
      x402Version: 1,
      paymentPayload: proof,
      paymentRequirements: requirements,
    });
  });

  it("returns the facilitator's verification result on success", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ isValid: true, payer: "0xabc" }), {
        status: 200,
      })) as typeof fetch;

    const client = new FacilitatorClient({ fetchImpl });
    const result = await client.verify(proof, requirements);

    expect(result).toEqual({ isValid: true, payer: "0xabc" });
  });

  it("passes through a real facilitator's rejection shape (isValid/invalidReason)", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          isValid: false,
          invalidReason: "invalid_exact_evm_signature",
          payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
        }),
        { status: 200 },
      )) as typeof fetch;

    const client = new FacilitatorClient({ fetchImpl });
    const result = await client.verify(proof, requirements);

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_exact_evm_signature");
    expect(result.payer).toBe("0x857b06519E91e3A54538791bDbb0E22373e36b66");
  });

  it("resolves with isValid:false instead of throwing when the facilitator times out", async () => {
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

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toMatch(/timed out/i);
  });

  it("resolves with isValid:false when the network call rejects outright", async () => {
    const failingFetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const client = new FacilitatorClient({ fetchImpl: failingFetch });
    const result = await client.verify(proof, requirements);

    expect(result).toEqual({ isValid: false, invalidReason: "ECONNREFUSED" });
  });
});
