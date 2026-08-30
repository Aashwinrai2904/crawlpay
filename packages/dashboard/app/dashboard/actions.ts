"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePublisher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Default price: 1 cent, converted to USDC's 6-decimal atomic units by the
 * internal API (see app/api/v1/config/route.ts) as 10_000 -- matches the
 * flat default every other part of this project already ships
 * (publisher-config.json, the WP plugin's Settings default, server.test.ts
 * fixtures), so a freshly created site behaves the same as everywhere else
 * until the publisher changes it.
 */
export async function createSite(formData: FormData): Promise<void> {
  const domain = String(formData.get("domain") ?? "").trim();
  if (!domain) {
    return;
  }

  const { publisher } = await requirePublisher();

  const site = await prisma.site.create({
    data: {
      publisherId: publisher.id,
      domain,
      middlewareDeployKey: randomBytes(32).toString("hex"),
    },
  });

  await prisma.policyRule.createMany({
    data: [
      { siteId: site.id, botClassification: "human", action: "allow" },
      { siteId: site.id, botClassification: "search-crawler", action: "allow" },
      { siteId: site.id, botClassification: "ai-crawler", action: "charge" },
      { siteId: site.id, botClassification: "unknown-bot", action: "block" },
    ],
  });
  await prisma.pricingRule.create({
    data: {
      siteId: site.id,
      pathPattern: "*",
      botClassification: "ai-crawler",
      priceCents: 1,
      currency: "USDC",
    },
  });

  revalidatePath("/dashboard");
}

/**
 * Issues a fresh deploy key for a site, invalidating the old one immediately
 * (any middleware still configured with it starts failing auth on its next
 * poll/transaction push). For rotating a key that's leaked or just as
 * routine hygiene -- there's no "previous key" to fall back to by design,
 * so the middleware's env var needs updating right after this runs.
 */
export async function regenerateDeployKey(formData: FormData): Promise<void> {
  const siteId = String(formData.get("siteId") ?? "");
  if (!siteId) {
    return;
  }

  const { publisher } = await requirePublisher();

  // updateMany (not update) so this silently no-ops instead of throwing if
  // siteId doesn't belong to this publisher -- scoping the WHERE clause is
  // what actually prevents rotating someone else's site's key.
  await prisma.site.updateMany({
    where: { id: siteId, publisherId: publisher.id },
    data: { middlewareDeployKey: randomBytes(32).toString("hex") },
  });

  revalidatePath(`/dashboard/sites/${siteId}/setup`);
}
