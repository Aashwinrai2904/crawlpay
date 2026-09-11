import {
  base64UrlEncode,
  InMemoryNonceStore,
  type PaymentProof,
  type PaymentVerifier,
  sleep,
} from "@crawlpay/core";
import { describe, expect, it, vi } from "vitest";
import type { BotSignatureConfig } from "../bot-detection";
import { InMemoryCacheStore, type CacheStore, type LockStore } from "../cache";
import { DashboardPublisherConfigSource } from "../config/dashboard-publisher-config-source";
import type { PublisherConfig } from "../config/publisher-config";
import { buildServer, type BuildServerOptions } from "../server";
import { CompositeTransactionLog, type Transaction, type TransactionLog } from "../transactions";

/**
 * Failure-mode / resilience coverage: does the middleware degrade
 * gracefully when a dependency (cache backend, transaction-log database,
 * config source, origin) is down, and does its cache-stampede protection
 * hold up under real concurrency?
 *
 * 4 tests assert resilience that exists. 3 use `it.fails` (marked GAP) to
 * pin resilience the middleware does NOT have -- each currently fails the
 * way you'd hope it wouldn't, so `it.fails` keeps the suite green while
 * documenting the hole; when the fix lands the body stops throwing and
 * `it.fails` turns red, forcing the switch back to a plain `it`.
 */

const GPTBOT_UA = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2";
const HUMAN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";

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

const PAYER = "0xFAILOVERPAYER0000000000000000000000000";
const PASSING_VERIFIER: PaymentVerifier = {
  verify: async () => ({ valid: true, payer: PAYER, amount: "10000" }),
};

/** A working origin -- the default so tests that aren't about the origin get a clean 200. */
const okOrigin: typeof fetch = async () =>
  new Response("<html><body>protected resource</body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });

class RecordingTransactionLog implements TransactionLog {
  readonly recorded: Transaction[] = [];
  async record(transaction: Transaction): Promise<void> {
    this.recorded.push(transaction);
  }
}

/** Stands in for PostgresTransactionLog when the database is unreachable. */
class RejectingTransactionLog implements TransactionLog {
  async record(): Promise<void> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
  }
}

/** Stands in for RedisCacheStore when Redis is unreachable -- every call rejects, like a real client would. */
const brokenCacheStore: CacheStore & LockStore = {
  get: async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:6379");
  },
  set: async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:6379");
  },
  invalidate: async () => {
    // not exercised by any test below
  },
  acquireLock: async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:6379");
  },
  releaseLock: async () => {
    // never reached: acquireLock always throws first
  },
};

function buildFailoverServer(overrides: Partial<BuildServerOptions> = {}) {
  return buildServer({
    originBaseUrl: "http://origin.internal",
    publisherConfig,
    botSignatureConfig,
    cacheStore: new InMemoryCacheStore(),
    nonceStore: new InMemoryNonceStore(),
    facilitatorClient: PASSING_VERIFIER,
    transactionLog: new RecordingTransactionLog(),
    fetchImpl: okOrigin,
    logger: false,
    ...overrides,
  });
}

type App = ReturnType<typeof buildFailoverServer>;

function makeProof(nonce: string, overrides: Partial<PaymentProof> = {}): PaymentProof {
  return {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    nonce,
    payload: { payer: PAYER },
    ...overrides,
  };
}

const xPayment = (proof: PaymentProof) => base64UrlEncode(JSON.stringify(proof));

/** Fire an unpaid GPTBot request and return the fresh nonce the 402 minted. */
async function nonceFrom402(app: App, path: string): Promise<string> {
  const res = await app.inject({ method: "GET", url: path, headers: { "user-agent": GPTBOT_UA } });
  expect(res.statusCode).toBe(402);
  return res.json().accepts[0].nonce as string;
}

// ---------------------------------------------------------------------------

describe("failure-mode resilience", () => {
  it.fails("serves without cache when Redis is down", async () => {
    // GAP: getCachedOrFetch() does not catch cache/lock-store errors, and
    // server.ts's serveFromOrigin() try/catch treats ANY rejection --
    // including a broken cache backend -- as an origin-fetch failure,
    // returning 502. There is no "bypass the cache and fetch origin
    // directly" fallback: a Redis outage takes down the whole reverse-proxy
    // path for every request, not just the caching layer, even a plain
    // human GET that would otherwise be trivially servable.
    const app = buildFailoverServer({ cacheStore: brokenCacheStore });

    const res = await app.inject({ method: "GET", url: "/", headers: { "user-agent": HUMAN_UA } });

    expect(res.statusCode).toBe(200);
  });

  it("returns 200 on paid request even if Postgres is down", async () => {
    // server.ts wraps the transaction-log write in try/catch specifically so
    // a logging outage can never turn a legitimately-paid request into a
    // failure for the crawler that paid.
    const app = buildFailoverServer({ transactionLog: new RejectingTransactionLog() });
    const nonce = await nonceFrom402(app, "/premium");

    const res = await app.inject({
      method: "GET",
      url: "/premium",
      headers: { "user-agent": GPTBOT_UA, "x-payment": xPayment(makeProof(nonce)) },
    });

    expect(res.statusCode).toBe(200);
  });

  it("fails silently on transaction log write if Postgres is down", async () => {
    // Production wires ConsoleTransactionLog + PostgresTransactionLog (+
    // DashboardTransactionLog) through CompositeTransactionLog, which fans
    // record() out via Promise.all. A rejecting sink doesn't stop the
    // others from actually running -- Promise.all rejecting doesn't undo an
    // already-completed sibling's side effect -- and the composite's own
    // rejection is what server.ts's catch swallows.
    const recorder = new RecordingTransactionLog();
    const composite = new CompositeTransactionLog([recorder, new RejectingTransactionLog()]);
    const app = buildFailoverServer({ transactionLog: composite });
    const nonce = await nonceFrom402(app, "/premium");

    const res = await app.inject({
      method: "GET",
      url: "/premium",
      headers: { "user-agent": GPTBOT_UA, "x-payment": xPayment(makeProof(nonce)) },
    });

    expect(res.statusCode).toBe(200); // the write failure never reaches the client
    expect(recorder.recorded).toHaveLength(1); // the healthy sink still got its write
    expect(recorder.recorded[0]?.url).toContain("/premium");
  });

  it("uses last-known-good config when dashboard is unreachable", async () => {
    const fallbackConfig: PublisherConfig = {
      ...publisherConfig,
      pricing: { ...publisherConfig.pricing, maxAmountRequired: "1" },
    };
    const goodConfig: PublisherConfig = {
      ...publisherConfig,
      pricing: { ...publisherConfig.pricing, maxAmountRequired: "99999" },
    };
    let dashboardUp = true;
    const fetchImpl: typeof fetch = async () =>
      dashboardUp
        ? new Response(JSON.stringify(goodConfig), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response("dashboard unreachable", { status: 500 });

    const source = new DashboardPublisherConfigSource({
      dashboardUrl: "https://dashboard.test",
      deployKey: "deploy-key",
      fallback: fallbackConfig,
      fetchImpl,
      pollIntervalMs: 20,
    });

    // First poll succeeds -- config moves off the fallback.
    await vi.waitFor(() => expect(source.getConfig().pricing.maxAmountRequired).toBe("99999"));

    // Dashboard goes down; several poll cycles fail.
    dashboardUp = false;
    await sleep(120);

    // Still the last config that DID parse -- not reverted to the
    // constructor fallback, and the failed polls never threw out of the
    // unawaited setInterval callback.
    expect(source.getConfig().pricing.maxAmountRequired).toBe("99999");
    source.stop();
  });

  it("falls back to local JSON config if dashboard stays unreachable", async () => {
    // buildServer()'s DashboardPublisherConfigSource is constructed with
    // fallback: loadPublisherConfig() -- the local
    // packages/middleware/config/publisher-config.json. If the dashboard
    // has never once answered successfully, requests are priced and
    // charged straight from that file.
    const alwaysDown: typeof fetch = async () => new Response("down", { status: 500 });
    const app = buildServer({
      originBaseUrl: "http://origin.internal",
      botSignatureConfig,
      cacheStore: new InMemoryCacheStore(),
      nonceStore: new InMemoryNonceStore(),
      facilitatorClient: PASSING_VERIFIER,
      transactionLog: new RecordingTransactionLog(),
      fetchImpl: alwaysDown,
      dashboardUrl: "https://dashboard.test",
      dashboardDeployKey: "deploy-key",
      logger: false,
    });

    const res = await app.inject({
      method: "GET",
      url: "/premium",
      headers: { "user-agent": GPTBOT_UA },
    });

    expect(res.statusCode).toBe(402);
    const requirements = res.json().accepts[0];
    // These can only have come from the local file -- the dashboard fetch
    // never once succeeded.
    expect(requirements.payTo).toBe("0xPUBLISHER00000000000000000000000000000");
    expect(requirements.maxAmountRequired).toBe("10000");
  });

  it("passes through origin 500 without charging", async () => {
    // "Without charging" here is the HTTP-status-level claim: the crawler
    // does not get a silent 402 retry loop or a fabricated 200 -- the real
    // 500 propagates untouched. It does NOT mean payment was skipped; see
    // the it.fails test right below for that half of the claim.
    const failingOrigin: typeof fetch = async () => new Response("origin exploded", { status: 500 });
    const app = buildFailoverServer({ fetchImpl: failingOrigin });
    const nonce = await nonceFrom402(app, "/premium");

    const res = await app.inject({
      method: "GET",
      url: "/premium",
      headers: { "user-agent": GPTBOT_UA, "x-payment": xPayment(makeProof(nonce)) },
    });

    expect(res.statusCode).not.toBe(402);
    expect(res.statusCode).not.toBe(200);
    expect(res.statusCode).toBe(500);
  });

  it.fails("does not charge when the origin fails after payment is verified", async () => {
    // GAP: the payment gate runs BEFORE the origin fetch, not after. The
    // proof's nonce is consumed and the transaction is recorded as soon as
    // the facilitator reports valid:true -- regardless of what origin does
    // next. There is no refund or rollback if origin then fails to deliver
    // the content the crawler just paid for.
    const recorder = new RecordingTransactionLog();
    const failingOrigin: typeof fetch = async () => new Response("origin exploded", { status: 500 });
    const app = buildFailoverServer({ fetchImpl: failingOrigin, transactionLog: recorder });
    const nonce = await nonceFrom402(app, "/premium");

    await app.inject({
      method: "GET",
      url: "/premium",
      headers: { "user-agent": GPTBOT_UA, "x-payment": xPayment(makeProof(nonce)) },
    });

    expect(recorder.recorded).toHaveLength(0);
  });

  it(
    "handles 500 concurrent GPTBot requests with exactly 1 origin fetch",
    async () => {
      let originFetchCount = 0;
      const slowOrigin: typeof fetch = async () => {
        originFetchCount += 1;
        await sleep(20); // widen the race window so requests genuinely overlap
        return new Response("<html>expensive content</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      };
      const app = buildFailoverServer({ fetchImpl: slowOrigin });

      // Nonces are single-use (InMemoryNonceStore): 500 concurrent requests
      // need 500 distinct valid proofs to all reach serveFromOrigin. Reusing
      // one nonce would test nonce-replay rejection (only 1 of 500 would
      // ever get past the charge gate), not cache-stampede protection.
      const CONCURRENCY = 500;
      const nonces = await Promise.all(
        Array.from({ length: CONCURRENCY }, () => nonceFrom402(app, "/expensive")),
      );

      const responses = await Promise.all(
        nonces.map((nonce) =>
          app.inject({
            method: "GET",
            url: "/expensive",
            headers: { "user-agent": GPTBOT_UA, "x-payment": xPayment(makeProof(nonce)) },
          }),
        ),
      );

      expect(responses.every((r) => r.statusCode === 200)).toBe(true);
      expect(originFetchCount).toBe(1);
    },
    10_000,
  );
});
