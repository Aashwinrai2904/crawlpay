import { z } from "zod";

/**
 * Bot-traffic analytics for a site. The dashboard does not store request
 * logs itself -- the middleware is the source of truth. This module is the
 * one place that calls the middleware's GET /api/v1/analytics/requests and
 * shapes the result for the /dashboard/analytics page. Because a middleware
 * may be unreachable or unconfigured, every failure degrades to an empty
 * roll-up with `degraded: true` rather than throwing.
 */

const OutcomeCountsSchema = z.object({
  requests: z.number(),
  allow: z.number(),
  charge402: z.number(),
  block: z.number(),
  paid: z.number(),
});

const RequestAnalyticsSchema = z.object({
  totals: OutcomeCountsSchema,
  byBot: z.array(OutcomeCountsSchema.extend({ botName: z.string(), pages: z.number() })),
  byPage: z.array(OutcomeCountsSchema.extend({ resource: z.string() })),
  byHour: z.array(OutcomeCountsSchema.extend({ hour: z.string() })),
  heatmap: z.array(z.object({ botName: z.string(), resource: z.string(), requests: z.number() })),
});

const MiddlewareResponseSchema = RequestAnalyticsSchema.extend({
  siteId: z.string().nullable().optional(),
  hours: z.number().optional(),
  since: z.string().optional(),
});

export type OutcomeCounts = z.infer<typeof OutcomeCountsSchema>;
export type RequestAnalytics = z.infer<typeof RequestAnalyticsSchema>;
export type BotBucket = RequestAnalytics["byBot"][number];
export type PageBucket = RequestAnalytics["byPage"][number];
export type HourBucket = RequestAnalytics["byHour"][number];
export type HeatmapCell = RequestAnalytics["heatmap"][number];

export interface SiteAnalytics extends RequestAnalytics {
  siteId: string;
  hours: number;
  /** True when the middleware couldn't be reached or isn't configured; the roll-up is empty. */
  degraded: boolean;
  /** Present only when degraded, for the page to show why. */
  degradedReason?: string;
}

export const EMPTY_ANALYTICS: RequestAnalytics = {
  totals: { requests: 0, allow: 0, charge402: 0, block: 0, paid: 0 },
  byBot: [],
  byPage: [],
  byHour: [],
  heatmap: [],
};

function degraded(siteId: string, hours: number, reason: string): SiteAnalytics {
  return { siteId, hours, degraded: true, degradedReason: reason, ...EMPTY_ANALYTICS };
}

/**
 * Calls the configured middleware for one site's traffic roll-up.
 * `CRAWLPAY_MIDDLEWARE_URL` and `CRAWLPAY_MIDDLEWARE_SITE_KEY` name a
 * single middleware deployment; per-site middleware URLs would need a
 * column on Site (see PR notes).
 */
export async function fetchSiteAnalytics(
  siteId: string,
  hours = 24,
  fetchImpl: typeof fetch = fetch,
): Promise<SiteAnalytics> {
  const baseUrl = process.env.CRAWLPAY_MIDDLEWARE_URL;
  const siteKey = process.env.CRAWLPAY_MIDDLEWARE_SITE_KEY;
  if (!baseUrl || !siteKey) {
    return degraded(
      siteId,
      hours,
      "Set CRAWLPAY_MIDDLEWARE_URL and CRAWLPAY_MIDDLEWARE_SITE_KEY to connect this dashboard to your middleware.",
    );
  }

  const url = new URL("/api/v1/analytics/requests", baseUrl);
  url.searchParams.set("siteId", siteId);
  url.searchParams.set("hours", String(hours));

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { "x-crawlpay-site-key": siteKey },
      cache: "no-store",
    });
  } catch (error) {
    return degraded(siteId, hours, `Middleware unreachable: ${(error as Error).message}`);
  }

  if (!response.ok) {
    return degraded(siteId, hours, `Middleware returned ${response.status}.`);
  }

  const parsed = MiddlewareResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return degraded(siteId, hours, "Middleware response did not match the expected shape.");
  }

  const { totals, byBot, byPage, byHour, heatmap } = parsed.data;
  return { siteId, hours, degraded: false, totals, byBot, byPage, byHour, heatmap };
}
