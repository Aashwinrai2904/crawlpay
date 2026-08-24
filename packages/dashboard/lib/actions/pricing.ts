"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import { requireSiteForPublisher } from "../require-site";
import { isBotClassification, isPolicyAction } from "../site-config";

export async function upsertPricingRule(formData: FormData): Promise<void> {
  const siteId = String(formData.get("siteId") ?? "");
  const { site } = await requireSiteForPublisher(siteId);

  const id = String(formData.get("id") ?? "") || undefined;
  const pathPattern = String(formData.get("pathPattern") ?? "").trim() || "*";
  const botClassification = String(formData.get("botClassification") ?? "");
  const currency =
    String(formData.get("currency") ?? "usd")
      .trim()
      .toLowerCase() || "usd";
  const priceDollars = Number(formData.get("priceDollars") ?? "0");

  if (!isBotClassification(botClassification)) {
    throw new Error("Invalid bot classification");
  }
  if (!Number.isFinite(priceDollars) || priceDollars < 0) {
    throw new Error("Invalid price");
  }
  const priceCents = Math.round(priceDollars * 100);

  if (id) {
    const existing = await prisma.pricingRule.findFirst({ where: { id, siteId: site.id } });
    if (!existing) {
      throw new Error("Pricing rule not found");
    }
    await prisma.pricingRule.update({
      where: { id },
      data: { pathPattern, botClassification, currency, priceCents },
    });
  } else {
    await prisma.pricingRule.upsert({
      where: {
        siteId_pathPattern_botClassification: { siteId: site.id, pathPattern, botClassification },
      },
      create: { siteId: site.id, pathPattern, botClassification, currency, priceCents },
      update: { currency, priceCents },
    });
  }

  revalidatePath(`/dashboard/sites/${site.id}/pricing`);
}

export async function deletePricingRule(formData: FormData): Promise<void> {
  const siteId = String(formData.get("siteId") ?? "");
  const { site } = await requireSiteForPublisher(siteId);
  const id = String(formData.get("id") ?? "");

  await prisma.pricingRule.deleteMany({ where: { id, siteId: site.id } });
  revalidatePath(`/dashboard/sites/${site.id}/pricing`);
}

export async function setPolicyAction(formData: FormData): Promise<void> {
  const siteId = String(formData.get("siteId") ?? "");
  const { site } = await requireSiteForPublisher(siteId);

  const botClassification = String(formData.get("botClassification") ?? "");
  const action = String(formData.get("action") ?? "");

  if (!isBotClassification(botClassification) || !isPolicyAction(action)) {
    throw new Error("Invalid policy rule");
  }

  await prisma.policyRule.upsert({
    where: { siteId_botClassification: { siteId: site.id, botClassification } },
    create: { siteId: site.id, botClassification, action },
    update: { action },
  });

  revalidatePath(`/dashboard/sites/${site.id}/pricing`);
}
