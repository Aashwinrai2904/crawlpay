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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
