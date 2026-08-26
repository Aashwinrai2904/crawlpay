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
