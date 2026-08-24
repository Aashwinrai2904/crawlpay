import { describe, expect, it } from "vitest";
import {
  atomicUnitsToDollars,
  centsToAtomicUnits,
  DEFAULT_POLICY,
  resolvePublisherConfig,
} from "./site-config";

describe("centsToAtomicUnits / atomicUnitsToDollars", () => {
  it("converts a dollar price to USDC's 6-decimal atomic units and back", () => {
    expect(centsToAtomicUnits(1)).toBe("10000"); // $0.01
    expect(centsToAtomicUnits(150)).toBe("1500000"); // $1.50
    expect(atomicUnitsToDollars("10000")).toBeCloseTo(0.01);
    expect(atomicUnitsToDollars("1500000")).toBeCloseTo(1.5);
  });

  it("returns 0 for a malformed amount instead of throwing", () => {
    expect(atomicUnitsToDollars("not-a-number")).toBe(0);
  });
});

describe("resolvePublisherConfig", () => {
  const baseSite = {
    id: "site_1",
    publisherId: "pub_1",
    domain: "example.com",
    middlewareDeployKey: "key",
    network: "base-sepolia",
    asset: "USDC",
    maxTimeoutSeconds: 60,
    createdAt: new Date(),
    publisher: { walletAddress: "0xPUBLISHER" },
  };

  it("falls back to defaults with no rules at all", () => {
    const config = resolvePublisherConfig({ ...baseSite, policyRules: [], pricingRules: [] });
    expect(config.policy).toEqual(DEFAULT_POLICY);
    expect(config.pricing).toEqual({
      network: "base-sepolia",
      asset: "USDC",
      maxAmountRequired: centsToAtomicUnits(1),
      payTo: "0xPUBLISHER",
      maxTimeoutSeconds: 60,
    });
  });

  it("overrides policy per rule and prices from the catch-all ai-crawler rule", () => {
    const config = resolvePublisherConfig({
      ...baseSite,
      policyRules: [
        { id: "p1", siteId: "site_1", botClassification: "unknown-bot", action: "allow" },
      ],
      pricingRules: [
        {
          id: "r1",
          siteId: "site_1",
          pathPattern: "*",
          botClassification: "ai-crawler",
          priceCents: 250,
          currency: "usd",
          updatedAt: new Date(),
        },
        {
          id: "r2",
          siteId: "site_1",
          pathPattern: "/premium/*",
          botClassification: "ai-crawler",
          priceCents: 900,
          currency: "usd",
          updatedAt: new Date(),
        },
      ],
    });

    expect(config.policy["unknown-bot"]).toBe("allow");
    expect(config.policy["ai-crawler"]).toBe(DEFAULT_POLICY["ai-crawler"]);
    // Only the "*" catch-all rule feeds the flat price -- /premium/* is stored but not consumed yet.
    expect(config.pricing.maxAmountRequired).toBe(centsToAtomicUnits(250));
  });

  it("defaults payTo to an empty string when the publisher has no wallet set", () => {
    const config = resolvePublisherConfig({
      ...baseSite,
      publisher: { walletAddress: null },
      policyRules: [],
      pricingRules: [],
    });
    expect(config.pricing.payTo).toBe("");
  });
});
