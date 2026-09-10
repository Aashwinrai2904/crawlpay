import type { RequestLogEntry } from "./request-log";

/**
 * The four outcome buckets the dashboard charts break traffic into. A
 * request's bucket is derived from its status code plus classification,
 * since request_log stores the raw response, not the policy decision:
 *   - 402                       -> "charge402" (billed, not yet paid)
 *   - 403                       -> "block"
 *   - 2xx and an ai-crawler     -> "paid"    (a charged bot got content)
 *   - 2xx otherwise             -> "allow"
 *   - anything else (5xx, ...)  -> counted in `requests` only
 */
export type OutcomeBucket = "allow" | "charge402" | "block" | "paid";

export interface OutcomeCounts {
  requests: number;
  allow: number;
  charge402: number;
  block: number;
  paid: number;
}

export interface BotBucket extends OutcomeCounts {
  botName: string;
  /** Distinct resources this bot touched in the window. */
  pages: number;
}

export interface PageBucket extends OutcomeCounts {
  resource: string;
}

export interface HourBucket extends OutcomeCounts {
  /** ISO hour, e.g. "2026-09-10T14:00:00.000Z". */
  hour: string;
}

export interface HeatmapCell {
  botName: string;
  resource: string;
  requests: number;
}

export interface RequestAnalytics {
  totals: OutcomeCounts;
  byBot: BotBucket[];
  byPage: PageBucket[];
  byHour: HourBucket[];
  heatmap: HeatmapCell[];
}

export function bucketFor(entry: Pick<RequestLogEntry, "responseCode" | "classification">):
  | OutcomeBucket
  | null {
  if (entry.responseCode === 402) return "charge402";
  if (entry.responseCode === 403) return "block";
  if (entry.responseCode >= 200 && entry.responseCode < 300) {
    return entry.classification === "ai-crawler" ? "paid" : "allow";
  }
  return null;
}

function emptyCounts(): OutcomeCounts {
  return { requests: 0, allow: 0, charge402: 0, block: 0, paid: 0 };
}

function add(counts: OutcomeCounts, entry: RequestLogEntry): void {
  counts.requests += 1;
  const bucket = bucketFor(entry);
  if (bucket) counts[bucket] += 1;
}

function hourKey(timestamp: Date): string {
  const d = new Date(timestamp);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

/**
 * Pure roll-up of request-log rows into the shape the analytics page
 * renders: totals, and breakdowns by bot, by page, and by hour, plus a
 * bot x page heatmap. Ordering is deterministic (busiest first, then name)
 * so snapshots and charts are stable.
 */
export function aggregateRequests(entries: RequestLogEntry[]): RequestAnalytics {
  const totals = emptyCounts();
  const byBot = new Map<string, OutcomeCounts & { pages: Set<string> }>();
  const byPage = new Map<string, OutcomeCounts>();
  const byHour = new Map<string, OutcomeCounts>();
  const heatmap = new Map<string, HeatmapCell>();

  for (const entry of entries) {
    add(totals, entry);

    let bot = byBot.get(entry.botName);
    if (!bot) {
      bot = { ...emptyCounts(), pages: new Set<string>() };
      byBot.set(entry.botName, bot);
    }
    add(bot, entry);
    bot.pages.add(entry.resource);

    let page = byPage.get(entry.resource);
    if (!page) {
      page = emptyCounts();
      byPage.set(entry.resource, page);
    }
    add(page, entry);

    const hk = hourKey(entry.timestamp);
    let hour = byHour.get(hk);
    if (!hour) {
      hour = emptyCounts();
      byHour.set(hk, hour);
    }
    add(hour, entry);

    const cellKey = JSON.stringify([entry.botName, entry.resource]);
    const cell = heatmap.get(cellKey);
    if (cell) {
      cell.requests += 1;
    } else {
      heatmap.set(cellKey, { botName: entry.botName, resource: entry.resource, requests: 1 });
    }
  }

  const byRequestsDesc = (a: OutcomeCounts, b: OutcomeCounts) => b.requests - a.requests;

  return {
    totals,
    byBot: [...byBot.entries()]
      .map(([botName, c]) => ({
        botName,
        requests: c.requests,
        allow: c.allow,
        charge402: c.charge402,
        block: c.block,
        paid: c.paid,
        pages: c.pages.size,
      }))
      .sort((a, b) => byRequestsDesc(a, b) || a.botName.localeCompare(b.botName)),
    byPage: [...byPage.entries()]
      .map(([resource, c]) => ({ resource, ...c }))
      .sort((a, b) => byRequestsDesc(a, b) || a.resource.localeCompare(b.resource)),
    byHour: [...byHour.entries()]
      .map(([hour, c]) => ({ hour, ...c }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
    heatmap: [...heatmap.values()].sort(
      (a, b) =>
        b.requests - a.requests ||
        a.botName.localeCompare(b.botName) ||
        a.resource.localeCompare(b.resource),
    ),
  };
}

export const EMPTY_ANALYTICS: RequestAnalytics = {
  totals: emptyCounts(),
  byBot: [],
  byPage: [],
  byHour: [],
  heatmap: [],
};
