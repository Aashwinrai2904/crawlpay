import type { PolicyRule, PricingRule, Site } from "@prisma/client";

export const BOT_CLASSIFICATIONS = [
  "human",
  "search-crawler",
  "ai-crawler",
  "unknown-bot",
] as const;
export type BotClassification = (typeof BOT_CLASSIFICATIONS)[number];

export const POLICY_ACTIONS = ["allow", "charge", "block"] as const;
export type PolicyAction = (typeof POLICY_ACTIONS)[number];

/** Same defaults as the middleware's config/bot-policy.json placeholder. */
export const DEFAULT_POLICY: Record<BotClassification, PolicyAction> = {
  human: "allow",
  "search-crawler": "allow",
  "ai-crawler": "charge",
  "unknown-bot": "block",
};

export const CATCH_ALL_PATH_PATTERN = "*";
export const DEFAULT_PRICE_CENTS = 1;

// USDC's decimal count. Site.asset is a free-text field (mirroring the
// WordPress plugin's Settings > CrawlPay page), but converting a
// publisher-facing price_cents into the middleware's atomic-unit
// maxAmountRequired needs *some* fixed decimals -- 6 is correct for the
// only asset this product currently supports. Revisit if/when a site can
// pick a different asset.
export const ASSET_DECIMALS = 6;

export function centsToAtomicUnits(priceCents: number): string {
  return (BigInt(priceCents) * BigInt(10) ** BigInt(ASSET_DECIMALS - 2)).toString();
}

/** Inverse of centsToAtomicUnits, for displaying a Transaction.amount as dollars. */
export function atomicUnitsToDollars(amount: string): number {
  try {
    return Number(BigInt(amount)) / 10 ** ASSET_DECIMALS;
  } catch {
    return 0;
  }
}

export function isBotClassification(value: string): value is BotClassification {
  return (BOT_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function isPolicyAction(value: string): value is PolicyAction {
  return (POLICY_ACTIONS as readonly string[]).includes(value);
}

export interface PublisherConfigPayload {
  policy: Record<BotClassification, PolicyAction>;
  pricing: {
    network: string;
    asset: string;
    maxAmountRequired: string;
    payTo: string;
    maxTimeoutSeconds: number;
  };
}

type SiteWithConfig = Site & {
  policyRules: PolicyRule[];
  pricingRules: PricingRule[];
  publisher: { walletAddress: string | null };
};

/**
 * Builds the exact shape packages/middleware's PublisherConfigSchema
 * expects (see packages/middleware/src/config/publisher-config.ts), so the
 * middleware can `.parse()` this response with no translation. Only the
 * site's catch-all rule ("*", "ai-crawler") feeds the flat
 * maxAmountRequired the middleware's single-price model understands --
 * other PricingRule rows (different path_pattern/bot_classification) are
 * stored for the phase 7 dynamic-pricing work but not consumed here yet,
 * the same "accepted but not wired up" status as the WordPress plugin's
 * per-post price overrides.
 */
export function resolvePublisherConfig(site: SiteWithConfig): PublisherConfigPayload {
  const policy = { ...DEFAULT_POLICY };
  for (const rule of site.policyRules) {
    if (isBotClassification(rule.botClassification) && isPolicyAction(rule.action)) {
      policy[rule.botClassification] = rule.action;
    }
  }

  const catchAll =
    site.pricingRules.find(
      (rule) =>
        rule.pathPattern === CATCH_ALL_PATH_PATTERN && rule.botClassification === "ai-crawler",
    ) ?? site.pricingRules.find((rule) => rule.pathPattern === CATCH_ALL_PATH_PATTERN);

  return {
    policy,
    pricing: {
      network: site.network,
      asset: site.asset,
      maxAmountRequired: centsToAtomicUnits(catchAll?.priceCents ?? DEFAULT_PRICE_CENTS),
      payTo: site.publisher.walletAddress ?? "",
      maxTimeoutSeconds: site.maxTimeoutSeconds,
    },
  };
}
