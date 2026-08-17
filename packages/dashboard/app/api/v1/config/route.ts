import { NextResponse } from "next/server";
import { siteForDeployKey } from "@/lib/deploy-key-auth";
import { buildConfigResponse } from "./build-config-response";

/**
 * Polled by the deployed middleware (WordPressPublisherConfigSource's
 * sibling for dashboard-managed sites) instead of only reading its local
 * publisher-config.json. Shape matches the middleware's own
 * PublisherConfigSchema (policy + pricing) exactly, so it can be dropped in
 * as an alternate config source without the middleware needing to know the
 * difference.
 */
export async function GET(request: Request) {
  const site = await siteForDeployKey(request);
  if (!site) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(buildConfigResponse(site));
}
