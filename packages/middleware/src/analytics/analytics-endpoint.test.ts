import { InMemoryNonceStore, type PaymentVerifier } from "@crawlpay/core";
import { describe, expect, it } from "vitest";
import type { BotSignatureConfig } from "../bot-detection";
import { InMemoryCacheStore } from "../cache";
import type { PublisherConfig } from "../config/publisher-config";
import { buildServer } from "../server";
import type { TransactionLog } from "../transactions";
import { InMemoryRequestLog } from "./request-log";

const botSignatureConfig: BotSignatureConfig = {
  aiCrawlers: [{ name: "GPTBot", userAgentPattern: "GPTBot" }],
  searchCrawlers: [{ name: "Googlebot", userAgentPattern: "Googlebot" }],
};

const publisherConfig: PublisherConfig = {
  policy: { human: "allow", "search-crawler": "allow", "ai-crawler": "charge", "unknown-bot": "block" },
  pricing: {
    network: "base-sepolia",
    asset: "USDC",
    maxAmountRequired: "10000",
    payTo: "0xPUBLISHER00000000000000000000000000000",
    maxTimeoutSeconds: 60,
  },
};

class NoopTransactionLog implements TransactionLog {
  async record(): Promise<void> {
    // no-op: these tests don't assert on the transaction log
  }
}

/** No X-Payment header is ever sent below, so verify() is never actually reached. */
const alwaysUnverified: PaymentVerifier = {
  verify: async () => ({ valid: false }),
};

const SITE_KEY = "test-site-key";

function buildAnalyticsServer(requestLog: InMemoryRequestLog) {
  return buildServer({
    originBaseUrl: "http://127.0.0.1:1", // unused: block + 402 paths don't reach origin
    publisherConfig,
    botSignatureConfig,
    cacheStore: new InMemoryCacheStore(),
    nonceStore: new InMemoryNonceStore(),
    facilitatorClient: alwaysUnverified,
    transactionLog: new NoopTransactionLog(),
    requestLog,
    siteId: "site-abc",
    siteKey: SITE_KEY,
    logger: false,
  });
}

describe("GET /api/v1/analytics/requests", () => {
  it("requires the site key", async () => {
    const app = buildAnalyticsServer(new InMemoryRequestLog());
    const res = await app.inject({ method: "GET", url: "/api/v1/analytics/requests" });
    expect(res.statusCode).toBe(401);
  });

  it("aggregates the requests the middleware just classified", async () => {
    const requestLog = new InMemoryRequestLog();
    const app = buildAnalyticsServer(requestLog);

    const gpt = await app.inject({
      method: "GET",
      url: "/premium-article.html",
      headers: { "user-agent": "Mozilla/5.0 compatible; GPTBot/1.2" },
    });
    expect(gpt.statusCode).toBe(402);

    const unknown = await app.inject({
      method: "GET",
      url: "/whatever",
      headers: { "user-agent": "SomeWeirdCrawler/1.0" },
    });
    expect(unknown.statusCode).toBe(403);

    // recordRequest is fire-and-forget; let the microtask queue drain.
    await new Promise((r) => setImmediate(r));
    expect(requestLog.size).toBe(2);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/requests?siteId=site-abc&hours=24",
      headers: { "x-crawlpay-site-key": SITE_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.siteId).toBe("site-abc");
    expect(body.totals).toMatchObject({ requests: 2, charge402: 1, block: 1 });
    expect(body.byBot.find((b: { botName: string }) => b.botName === "GPTBot")).toMatchObject({
      charge402: 1,
    });
    expect(body.byBot.find((b: { botName: string }) => b.botName === "unknown-bot")).toMatchObject({
      block: 1,
    });
    expect(body.heatmap).toContainEqual({
      botName: "GPTBot",
      resource: "/premium-article.html",
      requests: 1,
    });
  });

  it("returns an empty roll-up when nothing matches the requested site", async () => {
    const app = buildAnalyticsServer(new InMemoryRequestLog());
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/analytics/requests?siteId=some-other-site",
      headers: { "x-crawlpay-site-key": SITE_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().totals).toEqual({ requests: 0, allow: 0, charge402: 0, block: 0, paid: 0 });
  });
});
