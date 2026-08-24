import { NextResponse, type NextRequest } from "next/server";
import { authorizeDeployKey } from "../../../../../../lib/internal-auth";
import { prisma } from "../../../../../../lib/prisma";
import { resolvePublisherConfig } from "../../../../../../lib/site-config";

/**
 * Polled by packages/middleware/src/config/publisher-config-source.ts
 * (DashboardPublisherConfigSource) in place of the local
 * publisher-config.json placeholder. Response shape matches
 * PublisherConfigSchema exactly so the middleware can parse it unchanged.
 */
export async function GET(request: NextRequest, { params }: { params: { siteId: string } }) {
  const site = await prisma.site.findUnique({
    where: { id: params.siteId },
    include: {
      publisher: { select: { walletAddress: true } },
      policyRules: true,
      pricingRules: true,
    },
  });

  if (!site) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!authorizeDeployKey(request, site.middlewareDeployKey)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(resolvePublisherConfig(site));
}
