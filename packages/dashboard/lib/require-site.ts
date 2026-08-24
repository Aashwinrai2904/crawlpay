import { notFound } from "next/navigation";
import { prisma } from "./prisma";
import { requireCurrentPublisher } from "./current-publisher";

/** Loads a site the current publisher owns, or 404s — never leaks another publisher's site by guessing an id. */
export async function requireSiteForPublisher(siteId: string) {
  const publisher = await requireCurrentPublisher();
  const site = await prisma.site.findFirst({
    where: { id: siteId, publisherId: publisher.id },
  });
  if (!site) {
    notFound();
  }
  return { publisher, site };
}
