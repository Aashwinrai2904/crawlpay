import { timingSafeEqual } from "node:crypto";

/**
 * Deliberately not user auth (no NextAuth session involved) -- this
 * authenticates a *site's middleware instance*, mirroring
 * packages/middleware/src/server.ts's own X-Crawlpay-Site-Key check.
 */
export const DEPLOY_KEY_HEADER = "x-crawlpay-deploy-key";

/** Narrowed to just what's needed so tests don't have to construct a real NextRequest. */
export interface HeaderSource {
  headers: { get(name: string): string | null };
}

export function authorizeDeployKey(request: HeaderSource, expectedKey: string): boolean {
  const provided = request.headers.get(DEPLOY_KEY_HEADER);
  if (!provided) {
    return false;
  }
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expectedKey);
  return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
}
