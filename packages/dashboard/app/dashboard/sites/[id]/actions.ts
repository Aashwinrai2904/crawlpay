"use server";

import { revalidatePath } from "next/cache";
import { requirePublisher } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Duplicated from the middleware's BotClassification/PolicyAction and the
// WP plugin's Settings::CLASSIFICATIONS/POLICY_ACTIONS rather than
// imported: this package doesn't (and shouldn't) depend on
// @crawlpay/middleware at runtime, and the WP plugin is PHP. Keep these
// three lists in sync by hand if the vocabulary ever changes.
const CLASSIFICATIONS = ["human", "search-crawler", "ai-crawler", "unknown-bot"] as const;
const POLICY_ACTIONS = ["allow", "charge", "block"] as const;

type Classification = (typeof CLASSIFICATIONS)[number];

function isClassification(value: string): value is Classification {
  return (CLASSIFICATIONS as readonly string[]).includes(value);
}

function isPolicyAction(value: string): value is (typeof POLICY_ACTIONS)[number] {
  return (POLICY_ACTIONS as readonly string[]).includes(value);
}

async function requireOwnedSite(siteId: string) {
  const { publisher } = await requirePublisher();
  const site = await prisma.site.findFirst({ where: { id: siteId, publisherId: publisher.id } });
  if (!site) {
    throw new Error("Site not found");
  }
  return site;
}

export async function updatePolicy(siteId: string, formData: FormData): Promise<void> {
  const site = await requireOwnedSite(siteId);

  for (const classification of CLASSIFICATIONS) {
    const action = formData.get(`policy-${classification}`);
    if (typeof action === "string" && isPolicyAction(action)) {
      await prisma.policyRule.upsert({
        where: {
          siteId_botClassification: { siteId: site.id, botClassification: classification },
        },
        update: { action },
        create: { siteId: site.id, botClassification: classification, action },
      });
    }
  }

  revalidatePath(`/dashboard/sites/${site.id}/pricing`);
}

export async function upsertPricingRule(siteId: string, formData: FormData): Promise<void> {
  const site = await requireOwnedSite(siteId);

  const botClassification = String(formData.get("botClassification") ?? "");
  const pathPattern = String(formData.get("pathPattern") ?? "*").trim() || "*";
  const priceCents = Number(formData.get("priceCents"));
  const currency = String(formData.get("currency") ?? "USDC").trim() || "USDC";

  if (!isClassification(botClassification) || !Number.isFinite(priceCents) || priceCents < 0) {
    return;
  }

  const existingId = formData.get("ruleId");
  if (typeof existingId === "string" && existingId) {
    await prisma.pricingRule.updateMany({
      where: { id: existingId, siteId: site.id },
      data: { pathPattern, botClassification, priceCents, currency, updatedAt: new Date() },
    });
  } else {
    await prisma.pricingRule.create({
      data: { siteId: site.id, pathPattern, botClassification, priceCents, currency },
    });
  }

  revalidatePath(`/dashboard/sites/${site.id}/pricing`);
}

export async function deletePricingRule(siteId: string, ruleId: string): Promise<void> {
  const site = await requireOwnedSite(siteId);
  await prisma.pricingRule.deleteMany({ where: { id: ruleId, siteId: site.id } });
  revalidatePath(`/dashboard/sites/${site.id}/pricing`);
}
