import { describe, expect, it } from "vitest";
import { build402Response } from "./response";
import { parsePaymentProof } from "./proof";
import { base64UrlEncode } from "./utils";
import type { PaymentProof, PaymentRequirements } from "./x402";

function buildRequirements(): PaymentRequirements {
  return {
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
}

/** A well-formed exact/EVM proof -- fake signature, real EIP-3009 shape. */
function buildProof(nonce: string): PaymentProof {
  return {
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
        nonce,
      },
    },
  };
}

function encodeProofHeader(proof: PaymentProof): string {
  return base64UrlEncode(JSON.stringify(proof));
}

describe("x402 handshake round trip", () => {
  it("builds a spec-shaped 402 response and parses the matching proof back out", () => {
    const requirements = buildRequirements();

    const response = build402Response(requirements);
    expect(response.status).toBe(402);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.body).toEqual({ x402Version: 1, accepts: [requirements] });

    const proof = buildProof("0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480");

    const headers = { "X-Payment": encodeProofHeader(proof) };
    expect(parsePaymentProof(headers)).toEqual(proof);
  });
});

describe("parsePaymentProof malformed input", () => {
  it("returns null when the header is missing", () => {
    expect(parsePaymentProof({})).toBeNull();
  });

  it("returns null when the header isn't valid base64", () => {
    expect(parsePaymentProof({ "x-payment": "%%%not-base64%%%" })).toBeNull();
  });

  it("returns null when the decoded payload isn't valid JSON", () => {
    expect(parsePaymentProof({ "x-payment": base64UrlEncode("not json") })).toBeNull();
  });

  it("returns null when the decoded JSON fails schema validation", () => {
    const badProof = base64UrlEncode(JSON.stringify({ scheme: "exact" }));
    expect(parsePaymentProof({ "x-payment": badProof })).toBeNull();
  });

  it("returns null when payload is missing the EIP-3009 authorization", () => {
    const shallowProof = base64UrlEncode(
      JSON.stringify({
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: { note: "opaque, no signature" },
      }),
    );
    expect(parsePaymentProof({ "x-payment": shallowProof })).toBeNull();
  });
});
