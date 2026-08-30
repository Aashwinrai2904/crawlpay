import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  FacilitatorClient,
  InMemoryNonceStore,
  base64UrlEncode,
  type PaymentProof,
} from "@crawlpay/core";
import { buildApp as buildMockFacilitatorApp } from "mock-facilitator";
import { buildApp as buildMockOriginApp } from "mock-origin";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotSignatureConfig } from "./bot-detection";
import { cacheMetrics, InMemoryCacheStore } from "./cache";
import type { PublisherConfig } from "./config/publisher-config";
import { buildServer, type BuildServerOptions } from "./server";
import type { Transaction, TransactionLog } from "./transactions";

let originServer: Server;
let originUrl: string;
let facilitatorServer: Server;
let facilitatorUrl: string;

beforeAll(async () => {
  originServer = await listenOnEphemeralPort(buildMockOriginApp().listen(0));
  originUrl = addressUrl(originServer);

  facilitatorServer = await listenOnEphemeralPort(buildMockFacilitatorApp().listen(0));
  facilitatorUrl = addressUrl(facilitatorServer);
});

afterAll(async () => {
  await new Promise((resolve) => originServer.close(resolve));
  await new Promise((resolve) => facilitatorServer.close(resolve));
});

beforeEach(() => {
  cacheMetrics.reset();
});

function listenOnEphemeralPort(server: Server): Promise<Server> {
  return new Promise((resolve) => server.once("listening", () => resolve(server)));
}

function addressUrl(server: Server): string {
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const botSignatureConfig: BotSignatureConfig = {
  aiCrawlers: [{ name: "GPTBot", userAgentPattern: "GPTBot" }],
  searchCrawlers: [{ name: "Googlebot", userAgentPattern: "Googlebot" }],
};

const publisherConfig: PublisherConfig = {
  policy: {
    human: "allow",
    "search-crawler": "allow",
    "ai-crawler": "charge",
    "unknown-bot": "block",
  },
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
    // intentionally does nothing — tests that don't care about the log inject this
  }
}

function buildTestServer(overrides: Partial<BuildServerOptions> = {}) {
  return buildServer({
    originBaseUrl: originUrl,
    publisherConfig,
    botSignatureConfig,
    cacheStore: new InMemoryCacheStore(),
    nonceStore: new InMemoryNonceStore(),
    facilitatorClient: new FacilitatorClient({ baseUrl: facilitatorUrl }),
    transactionLog: new NoopTransactionLog(),
    logger: false,
    ...overrides,
  });
}

function encodePaymentHeader(proof: PaymentProof): string {
  return base64UrlEncode(JSON.stringify(proof));
}

const HUMAN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const GPTBOT_UA = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2";
const UNKNOWN_BOT_UA = "SomeWeirdCrawler/1.0";

describe("allow (human, search-crawler)", () => {
  it("proxies straight through to origin, caching on the way", async () => {
    const app = buildTestServer();

    const first = await app.inject({
      method: "GET",
      url: "/index.html",
      headers: { "user-agent": HUMAN_UA },
    });
    expect(first.statusCode).toBe(200);
    expect(first.body).toContain("Mock Origin");
    expect(cacheMetrics.toPrometheusText()).toContain("crawlpay_cache_misses_total 1");

    const second = await app.inject({
      method: "GET",
      url: "/index.html",
      headers: { "user-agent": HUMAN_UA },
    });
    expect(second.statusCode).toBe(200);
    expect(second.body).toBe(first.body);
    expect(cacheMetrics.toPrometheusText()).toContain("crawlpay_cache_hits_total 1");
  });

  it("allows a known search crawler the same as a human", async () => {
    const app = buildTestServer();

    const response = await app.inject({
      method: "GET",
      url: "/index.html",
      headers: { "user-agent": GOOGLEBOT_UA },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Mock Origin");
  });
});

describe("block (unknown-bot)", () => {
  it("returns 403 without touching the cache or origin", async () => {
    const app = buildTestServer();

    const response = await app.inject({
      method: "GET",
      url: "/premium-article.html",
      headers: { "user-agent": UNKNOWN_BOT_UA },
    });

    expect(response.statusCode).toBe(403);
    expect(cacheMetrics.toPrometheusText()).toContain("crawlpay_cache_hits_total 0");
    expect(cacheMetrics.toPrometheusText()).toContain("crawlpay_cache_misses_total 0");
  });
});

describe("charge (ai-crawler)", () => {
  it("returns 402 with a payment manifest when no proof is presented", async () => {
    const app = buildTestServer();

    const response = await app.inject({
      method: "GET",
      url: "/premium-article.html",
      headers: { "user-agent": GPTBOT_UA },
    });

    expect(response.statusCode).toBe(402);
    const body = response.json();
    expect(body.x402Version).toBe(1);
    expect(body.error).toBe("Payment required for this resource.");
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0]).toMatchObject({
      maxAmountRequired: "10000",
      asset: "USDC",
      payTo: "0xPUBLISHER00000000000000000000000000000",
    });
  });

  it("returns a fresh 402 when the presented nonce was already used", async () => {
    const nonceStore = new InMemoryNonceStore();
    await nonceStore.consume("already-used-nonce");
    const app = buildTestServer({ nonceStore });

    const proof: PaymentProof = {
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      nonce: "already-used-nonce",
      payload: {},
    };

    const response = await app.inject({
      method: "GET",
      url: "/premium-article.html",
      headers: { "user-agent": GPTBOT_UA, "x-payment": encodePaymentHeader(proof) },
    });

    expect(response.statusCode).toBe(402);
  });

  it("verifies a valid proof, logs the transaction, and serves the resource", async () => {
    const recorded: Transaction[] = [];
    const transactionLog: TransactionLog = {
      record: async (transaction) => {
        recorded.push(transaction);
      },
    };
    const app = buildTestServer({ transactionLog });

    const proof: PaymentProof = {
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      nonce: "fresh-nonce-1",
      payload: {},
    };

    const response = await app.inject({
      method: "GET",
      url: "/premium-article.html",
      headers: { "user-agent": GPTBOT_UA, "x-payment": encodePaymentHeader(proof) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Premium Article");

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.botClassification).toBe("ai-crawler");
    expect(recorded[0]?.amount).toBe("10000");
    // mock-facilitator's /verify reads a top-level `payer` off the payload it
    // receives (our whole PaymentProof); since PaymentProof has no such
    // field, it falls back to its own mock payer string.
    expect(recorded[0]?.payer).toBe("0xMOCKPAYER00000000000000000000000000000");
  });

  it("rejects with a fresh 402 (not a crash) when the facilitator reports the proof invalid", async () => {
    const app = buildTestServer({
      facilitatorClient: { verify: async () => ({ valid: false, error: "insufficient funds" }) },
    });

    const proof: PaymentProof = {
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      nonce: "fresh-nonce-2",
      payload: {},
    };

    const response = await app.inject({
      method: "GET",
      url: "/premium-article.html",
      headers: { "user-agent": GPTBOT_UA, "x-payment": encodePaymentHeader(proof) },
    });

    expect(response.statusCode).toBe(402);
    const body = response.json();
    // the generic message, not the facilitator's actual reason
    expect(body.error).toBe("Payment required for this resource.");
    expect(body.error).not.toMatch(/insufficient funds/);
  });
});

describe("health and metrics", () => {
  it("GET /health reports ok", async () => {
    const app = buildTestServer();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
  });

  it("GET /metrics reports Prometheus text", async () => {
    const app = buildTestServer();
    const response = await app.inject({ method: "GET", url: "/metrics" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("crawlpay_cache_hits_total");
  });
});

describe("GET /stats", () => {
  const SITE_KEY = "top-secret";
  const SITE_KEY_HEADERS = { "x-crawlpay-site-key": SITE_KEY };

  it("reports cache and revenue counters as JSON", async () => {
    const app = buildTestServer({ siteKey: SITE_KEY });

    const proof: PaymentProof = {
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      nonce: "stats-nonce-1",
      payload: {},
    };
    await app.inject({
      method: "GET",
      url: "/premium-article.html",
      headers: { "user-agent": GPTBOT_UA, "x-payment": encodePaymentHeader(proof) },
    });

    const response = await app.inject({ method: "GET", url: "/stats", headers: SITE_KEY_HEADERS });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.cache).toEqual(
      expect.objectContaining({ hits: expect.any(Number), misses: expect.any(Number) }),
    );
    expect(body.revenue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ classification: "ai-crawler", count: expect.any(Number) }),
      ]),
    );
  });

  it("requires the site key when one is configured: no key, wrong key, right key", async () => {
    const app = buildTestServer({ siteKey: SITE_KEY });

    const noKey = await app.inject({ method: "GET", url: "/stats" });
    expect(noKey.statusCode).toBe(401);

    const wrongKey = await app.inject({
      method: "GET",
      url: "/stats",
      headers: { "x-crawlpay-site-key": "a-different-sites-key" },
    });
    expect(wrongKey.statusCode).toBe(401);

    const rightKey = await app.inject({ method: "GET", url: "/stats", headers: SITE_KEY_HEADERS });
    expect(rightKey.statusCode).toBe(200);
  });

  it("refuses every request when no site key is configured at all (fails closed, not open)", async () => {
    const app = buildTestServer({ siteKey: undefined });

    const response = await app.inject({ method: "GET", url: "/stats" });

    expect(response.statusCode).toBe(401);
  });
});

describe("POST /verify-and-price (Mode B synchronous check)", () => {
  const SITE_KEY = "top-secret";
  const SITE_KEY_HEADERS = { "x-crawlpay-site-key": SITE_KEY };

  it("returns a charge decision with a payment manifest when no proof is given", async () => {
    const app = buildTestServer({ siteKey: SITE_KEY });

    const response = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      headers: SITE_KEY_HEADERS,
      payload: { url: "http://example.test/premium-article.html" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.action).toBe("charge");
    expect(body.paymentRequired.accepts[0].maxAmountRequired).toBe("10000");
  });

  it("returns allow and records a transaction for a valid proof", async () => {
    const recorded: Transaction[] = [];
    const transactionLog: TransactionLog = {
      record: async (transaction) => {
        recorded.push(transaction);
      },
    };
    const app = buildTestServer({ siteKey: SITE_KEY, transactionLog });

    const proof: PaymentProof = {
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      nonce: "verify-and-price-nonce-1",
      payload: {},
    };

    const response = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      headers: SITE_KEY_HEADERS,
      payload: {
        url: "http://example.test/premium-article.html",
        paymentProofHeader: encodePaymentHeader(proof),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ action: "allow" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.botClassification).toBe("ai-crawler");
  });

  it("rejects malformed request bodies", async () => {
    const app = buildTestServer({ siteKey: SITE_KEY });

    const response = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      headers: SITE_KEY_HEADERS,
      payload: { notAUrl: true },
    });

    expect(response.statusCode).toBe(400);
  });

  it("requires the site key when one is configured: no key, wrong key, right key", async () => {
    const app = buildTestServer({ siteKey: SITE_KEY });
    const payload = { url: "http://example.test/premium-article.html" };

    const noKey = await app.inject({ method: "POST", url: "/verify-and-price", payload });
    expect(noKey.statusCode).toBe(401);

    const wrongKey = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      headers: { "x-crawlpay-site-key": "a-different-sites-key" },
      payload,
    });
    expect(wrongKey.statusCode).toBe(401);

    const rightKey = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      headers: SITE_KEY_HEADERS,
      payload,
    });
    expect(rightKey.statusCode).toBe(200);
  });

  it("refuses every request when no site key is configured at all (fails closed, not open)", async () => {
    const app = buildTestServer({ siteKey: undefined });

    const response = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      payload: { url: "http://example.test/premium-article.html" },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe("wordpressUrl (polling WordPress for pricing/policy)", () => {
  it("charges using the payTo/price WordPress reports, not the local default", async () => {
    const wordpressConfig: PublisherConfig = {
      policy: publisherConfig.policy,
      pricing: {
        network: "base-sepolia",
        asset: "USDC",
        maxAmountRequired: "99999",
        payTo: "0xFROMWORDPRESS0000000000000000000000000",
        maxTimeoutSeconds: 60,
      },
    };

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/wp-json/crawlpay/v1/config")) {
        return new Response(JSON.stringify(wordpressConfig), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return fetch(input, init);
    };

    const app = buildTestServer({
      publisherConfig: undefined,
      wordpressUrl: "https://wordpress.example.test",
      fetchImpl,
    });

    // The first poll fires from the constructor without awaiting; give it a
    // tick to land before asserting on the config it produced.
    await vi.waitFor(async () => {
      const response = await app.inject({
        method: "GET",
        url: "/premium-article.html",
        headers: { "user-agent": GPTBOT_UA },
      });
      expect(response.json().accepts[0].payTo).toBe("0xFROMWORDPRESS0000000000000000000000000");
    });
  });
});

describe("dashboardUrl (polling the Phase 6 dashboard, takes priority over wordpressUrl)", () => {
  it("charges using the payTo/price the dashboard reports, and pushes a transaction there on payment", async () => {
    const dashboardConfig: PublisherConfig = {
      policy: publisherConfig.policy,
      pricing: {
        network: "base-sepolia",
        asset: "USDC",
        maxAmountRequired: "77777",
        payTo: "0xFROMDASHBOARD000000000000000000000000",
        maxTimeoutSeconds: 60,
      },
    };
    const pushedTransactions: unknown[] = [];

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/config")) {
        expect((init?.headers as Record<string, string>).authorization).toBe(
          "Bearer dashboard-deploy-key",
        );
        return new Response(JSON.stringify(dashboardConfig), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/v1/transactions")) {
        pushedTransactions.push(JSON.parse(init?.body as string));
        return new Response(JSON.stringify({ status: "ok" }), { status: 201 });
      }
      return fetch(input, init);
    };

    const app = buildTestServer({
      publisherConfig: undefined,
      wordpressUrl: "https://wordpress.example.test", // must be ignored -- dashboardUrl wins
      dashboardUrl: "https://dashboard.example.test",
      dashboardDeployKey: "dashboard-deploy-key",
      fetchImpl,
      // Deliberately not overridden with a NoopTransactionLog like other
      // tests: this exercises buildServer()'s real default composite,
      // which is what actually wires DashboardTransactionLog in. Postgres
      // isn't reachable in this test env, so PostgresTransactionLog's arm
      // of the Promise.all will reject -- caught by server.ts same as
      // production, and doesn't stop Console/DashboardTransactionLog from
      // still running.
      transactionLog: undefined,
    });

    await vi.waitFor(async () => {
      const response = await app.inject({
        method: "GET",
        url: "/premium-article.html",
        headers: { "user-agent": GPTBOT_UA },
      });
      expect(response.json().accepts[0].payTo).toBe("0xFROMDASHBOARD000000000000000000000000");
    });

    const proof: PaymentProof = {
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      nonce: "dashboard-wiring-nonce",
      payload: {},
    };
    const paid = await app.inject({
      method: "GET",
      url: "/premium-article.html",
      headers: { "user-agent": GPTBOT_UA, "x-payment": encodePaymentHeader(proof) },
    });
    expect(paid.statusCode).toBe(200);

    await vi.waitFor(() => expect(pushedTransactions).toHaveLength(1));
    expect(pushedTransactions[0]).toMatchObject({ botClassification: "ai-crawler" });
  });
});
