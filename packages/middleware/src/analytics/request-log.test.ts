import { describe, expect, it } from "vitest";
import { InMemoryRequestLog, NullRequestLog, PostgresRequestLog } from "./request-log";
import type { RequestLogEntry } from "./request-log";

function entry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    timestamp: new Date("2026-09-10T12:00:00.000Z"),
    siteId: "site-1",
    botName: "GPTBot",
    resource: "/a",
    classification: "ai-crawler",
    responseCode: 402,
    ...overrides,
  };
}

describe("InMemoryRequestLog", () => {
  it("records and returns rows at or after `since`", async () => {
    const log = new InMemoryRequestLog();
    await log.record(entry({ timestamp: new Date("2026-09-10T10:00:00Z") }));
    await log.record(entry({ timestamp: new Date("2026-09-10T12:00:00Z") }));

    const rows = await log.query({ since: new Date("2026-09-10T11:00:00Z") });
    expect(rows.map((r) => r.timestamp.toISOString())).toEqual(["2026-09-10T12:00:00.000Z"]);
    expect(log.size).toBe(2);
  });

  it("filters by siteId when one is given, returns all sites when not", async () => {
    const log = new InMemoryRequestLog();
    await log.record(entry({ siteId: "site-1" }));
    await log.record(entry({ siteId: "site-2" }));
    await log.record(entry({ siteId: null }));
    const since = new Date("2026-01-01T00:00:00Z");

    expect(await log.query({ since, siteId: "site-1" })).toHaveLength(1);
    expect(await log.query({ since })).toHaveLength(3);
  });
});

describe("NullRequestLog", () => {
  it("accepts writes and always reads back empty", async () => {
    const log = new NullRequestLog();
    await log.record(entry());
    expect(await log.query({ since: new Date(0) })).toEqual([]);
  });
});

describe("PostgresRequestLog", () => {
  it("creates the schema once, then inserts with mapped columns", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        return { rows: [] };
      },
    };
    const log = new PostgresRequestLog(client);

    await log.record(entry());
    await log.record(entry());

    expect(calls.filter((c) => c.text.includes("CREATE TABLE"))).toHaveLength(1);
    expect(calls.filter((c) => c.text.includes("INSERT INTO request_log")).map((c) => c.values)).toEqual(
      [
        [entry().timestamp, "site-1", "GPTBot", "/a", "ai-crawler", 402],
        [entry().timestamp, "site-1", "GPTBot", "/a", "ai-crawler", 402],
      ],
    );
  });

  it("adds a site_id filter to the query only when siteId is provided", async () => {
    const selects: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: async (text: string, values?: unknown[]) => {
        if (text.includes("SELECT")) selects.push({ text, values });
        return { rows: [] };
      },
    };
    const log = new PostgresRequestLog(client);
    const since = new Date("2026-09-10T00:00:00Z");

    await log.query({ since });
    await log.query({ since, siteId: "site-9" });

    expect(selects.map((s) => s.text.includes("site_id = $2"))).toEqual([false, true]);
    expect(selects.map((s) => s.values)).toEqual([[since], [since, "site-9"]]);
  });
});
