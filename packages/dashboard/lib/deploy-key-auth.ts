import { prisma } from "./prisma";

/**
 * Resolves the Site a middleware deploy key belongs to, or null if the
 * `Authorization: Bearer <key>` header is missing/doesn't match any site.
 * This is a bearer-secret credential (like the WP plugin's site key), not
 * a Supabase Auth session -- callers are the deployed middleware servers,
 * not browsers.
 */
export async function siteForDeployKey(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!key) {
    return null;
  }

  return prisma.site.findUnique({
    where: { middlewareDeployKey: key },
    include: { publisher: true, pricingRules: true, policyRules: true },
  });
}
