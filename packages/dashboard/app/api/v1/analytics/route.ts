import { NextResponse } from "next/server";
import { requirePublisher } from "@/lib/auth";
import { fetchSiteAnalytics } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";

/**
 * Read model for the /dashboard/analytics page (and anything else that
 * wants a site's bot-traffic roll-up as JSON). Auth is the publisher
 * session -- the caller must own the site. The data itself comes from the
 * middleware via fetchSiteAnalytics; this route just scopes it to the
 * signed-in publisher.
 */
export async function GET(request: Request) {
  const { publisher } = await requirePublisher();

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  const site = await prisma.site.findFirst({
    where: { id: siteId, publisherId: publisher.id },
    select: { id: true },
  });
  if (!site) {
    return NextResponse.json({ error: "site not found" }, { status: 404 });
  }

  const hoursParam = Number(searchParams.get("hours") ?? 24);
  const hours = Number.isFinite(hoursParam)
    ? Math.min(Math.max(Math.trunc(hoursParam), 1), 168)
    : 24;

  const analytics = await fetchSiteAnalytics(site.id, hours);
  return NextResponse.json(analytics);
}
