/**
 * Fires 100 concurrent AI-crawler requests at the same uncached URL through
 * the real Fastify server (not a direct getCachedOrFetch call, unlike Phase
 * 3's unit test) and asserts the origin was only actually fetched once —
 * proving the stampede protection holds under the full HTTP stack.
 *
 * Each request carries a distinct, valid payment proof so the requests
 * traverse the full charge path (parse proof -> consume nonce -> verify
 * with the facilitator -> cache-through), not just the cheaper allow path.
 *
 * Standalone diagnostic script: run manually via `pnpm load-test`. Not part
 * of the package's tsc project (see tsconfig.json's "include") or its
 * eslint run, so it isn't covered by `pnpm typecheck`/`pnpm lint` — it's
 * exercised by actually running it, not by static analysis.
 *
 * Spins up mock-origin, mock-facilitator, and the crawlpay server itself
 * in-process on ephemeral ports — no docker-compose required.
 */

import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import autocannon from "autocannon";
import {
  base64UrlEncode,
  FacilitatorClient,
  InMemoryNonceStore,
  type PaymentProof,
} from "@crawlpay/core";
import { buildApp as buildMockFacilitatorApp } from "mock-facilitator";
import { buildApp as buildMockOriginApp } from "mock-origin";
import type { BotSignatureConfig } from "../src/bot-detection";
import { cacheMetrics, InMemoryCacheStore } from "../src/cache";
import type { PublisherConfig } from "../src/config/publisher-config";
import { buildServer } from "../src/server";
import { ConsoleTransactionLog } from "../src/transactions";

const GPTBOT_UA = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2";
const CONCURRENCY = 100;
const TARGET_PATH = "/premium-article.html";

function onceListening(server: Server): Promise<void> {
  return new Promise((resolve) => server.once("listening", () => resolve()));
}

function addressUrl(server: Server): string {
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function main(): Promise<void> {
  const originServer = buildMockOriginApp().listen(0);
  await onceListening(originServer);
  const originUrl = addressUrl(originServer);

  const facilitatorServer = buildMockFacilitatorApp().listen(0);
  await onceListening(facilitatorServer);
  const facilitatorUrl = addressUrl(facilitatorServer);

  const botSignatureConfig: BotSignatureConfig = {
    aiCrawlers: [{ name: "GPTBot", userAgentPattern: "GPTBot" }],
    searchCrawlers: [],
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

  const app = buildServer({
    originBaseUrl: originUrl,
    publisherConfig,
    botSignatureConfig,
    cacheStore: new InMemoryCacheStore(),
    nonceStore: new InMemoryNonceStore(),
    facilitatorClient: new FacilitatorClient({ baseUrl: facilitatorUrl }),
    // Console-only: this script tests cache stampede protection, not the
    // Postgres-backed audit trail, and doesn't assume a real Postgres is
    // running.
    transactionLog: new ConsoleTransactionLog(),
    logger: false,
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const crawlpayUrl = addressUrl(app.server);

  cacheMetrics.reset();

  console.log(`Firing ${CONCURRENCY} concurrent requests at ${crawlpayUrl}${TARGET_PATH} ...`);

  let nonceCounter = 0;
  const result = await autocannon({
    url: `${crawlpayUrl}${TARGET_PATH}`,
    connections: CONCURRENCY,
    amount: CONCURRENCY,
    requests: [
      {
        method: "GET",
        setupRequest: (req) => {
          nonceCounter += 1;
          const proof: PaymentProof = {
            x402Version: 1,
            scheme: "exact",
            network: "base-sepolia",
            nonce: `load-test-${nonceCounter}-${randomUUID()}`,
            payload: {},
          };
          req.headers = {
            ...req.headers,
            "user-agent": GPTBOT_UA,
            "x-payment": base64UrlEncode(JSON.stringify(proof)),
          };
          return req;
        },
      },
    ],
  });

  console.log(autocannon.printResult(result));

  const missMatch = cacheMetrics.toPrometheusText().match(/crawlpay_cache_misses_total (\d+)/);
  const originFetchCount = missMatch ? Number(missMatch[1]) : -1;

  console.log(`\n2xx: ${result["2xx"]}  non-2xx: ${result.non2xx}  errors: ${result.errors}`);
  console.log(`origin fetch count (cache misses): ${originFetchCount}`);

  await app.close();
  await new Promise((resolve) => originServer.close(resolve));
  await new Promise((resolve) => facilitatorServer.close(resolve));

  if (originFetchCount !== 1) {
    console.error(
      `FAIL: expected exactly 1 origin fetch for ${CONCURRENCY} concurrent requests, got ${originFetchCount}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `PASS: stampede protection held — exactly 1 origin fetch for ${CONCURRENCY} concurrent requests.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
