import { describe, expect, it } from "vitest";
import { aggregateRequests, bucketFor, EMPTY_ANALYTICS } from "./aggregate";
import type { RequestLogEntry } from "./request-log";

function entry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    timestamp: new Date("2026-09-10T14:30:00.000Z"),
    siteId: "site-1",
    botName: "GPTBot",
    resource: "/premium-article.html",
    classification: "ai-crawler",
    responseCode: 402,
    ...overrides,
  };
}

describe("bucketFor", () => {
  it("maps status + classification to an outcome bucket", () => {
    expect(bucketFor({ responseCode: 402, classification: "ai-crawler" })).toBe("charge402");
    expect(bucketFor({ responseCode: 403, classification: "unknown-bot" })).toBe("block");
    expect(bucketFor({ responseCode: 200, classification: "ai-crawler" })).toBe("paid");
    expect(bucketFor({ responseCode: 200, classification: "human" })).toBe("allow");
    expect(bucketFor({ responseCode: 204, classification: "search-crawler" })).toBe("allow");
    expect(bucketFor({ responseCode: 502, classification: "human" })).toBeNull();
  });
});

describe("aggregateRequests", () => {
  it("returns all-zero totals and empty breakdowns for no rows", () => {
    expect(aggregateRequests([])).toEqual(EMPTY_ANALYTICS);
  });

  it("totals every outcome bucket and counts every request", () => {
    const { totals } = aggregateRequests([
      entry({ responseCode: 402 }),
      entry({ responseCode: 402 }),
      entry({ responseCode: 200, classification: "ai-crawler" }),
      entry({ botName: "Googlebot", classification: "search-crawler", responseCode: 200 }),
      entry({ botName: "unknown-bot", classification: "unknown-bot", responseCode: 403 }),
      entry({ responseCode: 502, classification: "ai-crawler" }),
    ]);

    expect(totals).toEqual({ requests: 6, allow: 1, charge402: 2, block: 1, paid: 1 });
  });

  it("groups by bot with a distinct-page count, busiest bot first", () => {
    const { byBot } = aggregateRequests([
      entry({ botName: "GPTBot", resource: "/a" }),
      entry({ botName: "GPTBot", resource: "/b" }),
      entry({ botName: "GPTBot", resource: "/a" }),
      entry({ botName: "ClaudeBot", resource: "/a" }),
    ]);

    expect(byBot.map((b) => b.botName)).toEqual(["GPTBot", "ClaudeBot"]);
    expect(byBot[0]).toMatchObject({ botName: "GPTBot", requests: 3, charge402: 3, pages: 2 });
    expect(byBot[1]).toMatchObject({ botName: "ClaudeBot", requests: 1, pages: 1 });
  });

  it("groups by page and by UTC hour", () => {
    const result = aggregateRequests([
      entry({ resource: "/x", timestamp: new Date("2026-09-10T14:05:00Z") }),
      entry({ resource: "/x", timestamp: new Date("2026-09-10T14:55:00Z") }),
      entry({ resource: "/y", timestamp: new Date("2026-09-10T15:01:00Z") }),
    ]);

    expect(result.byPage.map((p) => [p.resource, p.requests])).toEqual([
      ["/x", 2],
      ["/y", 1],
    ]);
    expect(result.byHour.map((h) => [h.hour, h.requests])).toEqual([
      ["2026-09-10T14:00:00.000Z", 2],
      ["2026-09-10T15:00:00.000Z", 1],
    ]);
  });

  it("builds a bot x page heatmap ordered by request count", () => {
    const { heatmap } = aggregateRequests([
      entry({ botName: "GPTBot", resource: "/a" }),
      entry({ botName: "GPTBot", resource: "/a" }),
      entry({ botName: "GPTBot", resource: "/b" }),
      entry({ botName: "Googlebot", resource: "/a" }),
    ]);

    expect(heatmap).toEqual([
      { botName: "GPTBot", resource: "/a", requests: 2 },
      { botName: "GPTBot", resource: "/b", requests: 1 },
      { botName: "Googlebot", resource: "/a", requests: 1 },
    ]);
  });
});
