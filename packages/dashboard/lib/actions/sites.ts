"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import { requireCurrentPublisher } from "../current-publisher";
import { requireSiteForPublisher } from "../require-site";
import { CATCH_ALL_PATH_PATTERN, DEFAULT_POLICY, DEFAULT_PRICE_CENTS } from "../site-config";

export async function createSite(formData: FormData): Promise<void> {
  const publisher = await requireCurrentPublisher();
  const domain = String(formData.get("domain") ?? "").trim();
  if (!domain) {
    throw new Error("Domain is required");
  }

  const site = await prisma.site.create({
    data: {
      publisherId: publisher.id,
      domain,
      policyRules: {
        create: Object.entries(DEFAULT_POLICY).map(([botClassification, action]) => ({
          botClassification,
          action,
        })),
      },
      pricingRules: {
        create: [
          {
            pathPattern: CATCH_ALL_PATH_PATTERN,
            botClassification: "ai-crawler",
            priceCents: DEFAULT_PRICE_CENTS,
          },
        ],
      },
    },
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard/sites/${site.id}/setup`);
}

export async function deleteSite(formData: FormData): Promise<void> {
  const siteId = String(formData.get("siteId") ?? "");
  const { site } = await requireSiteForPublisher(siteId);
  await prisma.site.delete({ where: { id: site.id } });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updatePublisherWallet(formData: FormData): Promise<void> {
  const publisher = await requireCurrentPublisher();
  const walletAddress = String(formData.get("walletAddress") ?? "").trim();
  const siteId = String(formData.get("siteId") ?? "");

  await prisma.user.update({
    where: { id: publisher.id },
    data: { walletAddress: walletAddress || null },
  });

  revalidatePath(`/dashboard/sites/${siteId}/pricing`);
}

export async function updateSiteParams(formData: FormData): Promise<void> {
  const siteId = String(formData.get("siteId") ?? "");
  const { site } = await requireSiteForPublisher(siteId);

  const network = String(formData.get("network") ?? "").trim() || site.network;
  const asset = String(formData.get("asset") ?? "").trim() || site.asset;
  const maxTimeoutSeconds = Number(formData.get("maxTimeoutSeconds") ?? site.maxTimeoutSeconds);

  await prisma.site.update({
    where: { id: site.id },
    data: {
      network,
      asset,
      maxTimeoutSeconds:
        Number.isFinite(maxTimeoutSeconds) && maxTimeoutSeconds > 0
          ? Math.trunc(maxTimeoutSeconds)
          : site.maxTimeoutSeconds,
    },
  });

  revalidatePath(`/dashboard/sites/${site.id}/pricing`);
}

export async function regenerateDeployKey(formData: FormData): Promise<void> {
  const siteId = String(formData.get("siteId") ?? "");
  const { site } = await requireSiteForPublisher(siteId);

  await prisma.site.update({
    where: { id: site.id },
    data: { middlewareDeployKey: randomBytes(24).toString("hex") },
  });

  revalidatePath(`/dashboard/sites/${site.id}/setup`);
}
