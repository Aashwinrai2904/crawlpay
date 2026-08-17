import { describe, expect, it } from "vitest";
import { buildConfigResponse } from "./build-config-response";
import { GET } from "./route";

describe("buildConfigResponse", () => {
  it("falls back to platform defaults when a site has no rules yet", () => {
    const result = buildConfigResponse({
      policyRules: [],
      pricingRules: [],
      publisher: { walletAddress: null },
    });

    expect(result.policy).toEqual({
      human: "allow",
      "search-crawler": "allow",
      "ai-crawler": "charge",
      "unknown-bot": "block",
    });
    expect(result.pricing).toEqual({
      network: "base-sepolia",
      asset: "USDC",
      maxAmountRequired: "10000",
      payTo: "",
      maxTimeoutSeconds: 60,
    });
  });

  it("derives pricing from the site-wide ai-crawler rule and the publisher's wallet", () => {
    const result = buildConfigResponse({
      policyRules: [{ botClassification: "ai-crawler", action: "block" }],
      pricingRules: [
        { botClassification: "ai-crawler", pathPattern: "/premium", currency: "USDC", priceCents: 99 },
        { botClassification: "ai-crawler", pathPattern: "*", currency: "USDC", priceCents: 5 },
      ],
      publisher: { walletAddress: "0xPUBLISHER" },
    });

    expect(result.policy["ai-crawler"]).toBe("block");
    expect(result.pricing.maxAmountRequired).toBe("50000");
    expect(result.pricing.payTo).toBe("0xPUBLISHER");
  });

  it("falls back to any ai-crawler rule when none matches the site-wide '*' path", () => {
    const result = buildConfigResponse({
      policyRules: [],
      pricingRules: [
        { botClassification: "ai-crawler", pathPattern: "/premium", currency: "USDC", priceCents: 7 },
      ],
      publisher: { walletAddress: null },
    });

    expect(result.pricing.maxAmountRequired).toBe("70000");
  });
});

describe("GET /api/v1/config", () => {
  it("returns 401 without a deploy key", async () => {
    const response = await GET(new Request("http://localhost/api/v1/config"));
    expect(response.status).toBe(401);
  });

  it("returns 401 with an unknown deploy key", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/config", {
        headers: { authorization: "Bearer not-a-real-key" },
      }),
    );
    expect(response.status).toBe(401);
  });
});
