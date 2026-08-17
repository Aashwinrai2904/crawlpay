// Duplicated vocabulary -- see the comment atop
// app/dashboard/sites/[id]/actions.ts for why this isn't imported from
// @crawlpay/middleware.
const CLASSIFICATIONS = ["human", "search-crawler", "ai-crawler", "unknown-bot"] as const;
const DEFAULT_POLICY: Record<(typeof CLASSIFICATIONS)[number], string> = {
  human: "allow",
  "search-crawler": "allow",
  "ai-crawler": "charge",
  "unknown-bot": "block",
};

export interface ConfigSourceSite {
  policyRules: { botClassification: string; action: string }[];
  pricingRules: { botClassification: string; pathPattern: string; currency: string; priceCents: number }[];
  publisher: { walletAddress: string | null };
}

/**
 * Pure derivation of the middleware-facing config shape from a site's
 * rules. Kept out of route.ts (rather than exported from it) because
 * Next.js route files may only export HTTP method handlers and a small
 * set of reserved names -- any other export fails the build's route type
 * check. See route.test.ts for the tests this split enables.
 */
export function buildConfigResponse(site: ConfigSourceSite) {
  const policy = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [
      classification,
      site.policyRules.find((rule) => rule.botClassification === classification)?.action ??
        DEFAULT_POLICY[classification],
    ]),
  );

  // Only a flat, site-wide ai-crawler price is consumed today -- per-path
  // PricingRule rows and non-ai-crawler pricing exist in the schema for
  // future use but the middleware's PublisherConfigSchema has nowhere to
  // put them yet (same "not yet consumed" gap the WP plugin's per-post
  // overrides already have, see its README).
  const defaultRule =
    site.pricingRules.find(
      (rule) => rule.botClassification === "ai-crawler" && rule.pathPattern === "*",
    ) ?? site.pricingRules.find((rule) => rule.botClassification === "ai-crawler");

  const pricing = {
    network: "base-sepolia",
    asset: defaultRule?.currency ?? "USDC",
    // priceCents is USD-cents; USDC has 6 decimals, so 1 cent = 10_000
    // atomic units at a 1:1 USD peg (matches the flat $0.01 default used
    // everywhere else in this project).
    maxAmountRequired: String((defaultRule?.priceCents ?? 1) * 10_000),
    payTo: site.publisher.walletAddress ?? "",
    maxTimeoutSeconds: 60,
  };

  return { policy, pricing };
}
