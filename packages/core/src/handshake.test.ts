import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { build402Response } from "./response";
import { parsePaymentProof } from "./proof";
import { base64UrlEncode } from "./utils";
import type { PaymentProof, PaymentRequirements } from "./x402";

function buildRequirements(nonce: string): PaymentRequirements {
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
    nonce,
  };
}

function encodeProofHeader(proof: PaymentProof): string {
  return base64UrlEncode(JSON.stringify(proof));
}

describe("x402 handshake round trip", () => {
  it("builds a spec-shaped 402 response and parses the matching proof back out", () => {
    const nonce = randomUUID();
    const requirements = buildRequirements(nonce);

    const response = build402Response(requirements);
    expect(response.status).toBe(402);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.body).toEqual({ x402Version: 1, accepts: [requirements] });

    const proof: PaymentProof = {
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      nonce,
      payload: { note: "opaque until Phase 2" },
    };

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
});
