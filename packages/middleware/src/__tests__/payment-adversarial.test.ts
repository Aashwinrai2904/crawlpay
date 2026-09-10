import { randomUUID } from "node:crypto";
import {
  base64UrlEncode,
  InMemoryNonceStore,
  type PaymentProof,
  type PaymentVerifier,
} from "@crawlpay/core";
import { describe, expect, it } from "vitest";
import type { BotSignatureConfig } from "../bot-detection";
import { InMemoryCacheStore } from "../cache";
import type { PublisherConfig } from "../config/publisher-config";
import { buildServer, type BuildServerOptions } from "../server";
import type { TransactionLog } from "../transactions";

/**
 * Adversarial payment-path coverage. Every request below MUST come back as
 * something other than 200 -- the middleware must never hand a crawler the
 * protected resource on a bad payment or a bad credential.
 *
 * Seven checks assert protections that exist today. Four use `it.fails`
 * (marked GAP) to pin protections the middleware does NOT have yet: it has
 * no proof-expiry, no per-resource binding, no amount check, and no
 * network check. `it.fails` keeps the suite green while documenting the
 * hole -- when the protection lands, its body stops throwing and `it.fails`
 * flips to red, forcing the switch back to a plain `it`.
 */

const GPTBOT_UA = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2";

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
    // adversarial tests don't assert on the transaction log
  }
}

const PAYER = "0xADVERSARIALPAYER0000000000000000000000";

const PASSING_VERIFIER: PaymentVerifier = {
  verify: async () => ({ valid: true, payer: PAYER, amount: "10000" }),
};
const REJECTING_VERIFIER: PaymentVerifier = {
  verify: async () => ({ valid: false, error: "signature does not recover to the payer" }),
};

/** A working origin, so a genuinely-paid request resolves to a clean 200 we can contrast against. */
const okOrigin: typeof fetch = async (_input, _init) =>
  new Response("<html><body>protected resource</body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });

function buildAdversarialServer(overrides: Partial<BuildServerOptions> = {}) {
  return buildServer({
    originBaseUrl: "http://origin.internal",
    publisherConfig,
    botSignatureConfig,
    cacheStore: new InMemoryCacheStore(),
    nonceStore: new InMemoryNonceStore(),
    facilitatorClient: PASSING_VERIFIER,
    transactionLog: new NoopTransactionLog(),
    fetchImpl: okOrigin,
    logger: false,
    ...overrides,
  });
}

type App = ReturnType<typeof buildAdversarialServer>;

function makeProof(overrides: Partial<PaymentProof> = {}): PaymentProof {
  return {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    nonce: randomUUID(),
    payload: { payer: PAYER },
    ...overrides,
  };
}

const xPayment = (proof: PaymentProof) => base64UrlEncode(JSON.stringify(proof));

/** Fire an unpaid GPTBot request and return the fresh nonce the 402 minted. */
async function nonceFrom402(app: App, path: string): Promise<string> {
  const res = await app.inject({ method: "GET", url: path, headers: { "user-agent": GPTBOT_UA } });
  expect(res.statusCode).toBe(402);
  const nonce = res.json().accepts[0].nonce as string;
  expect(typeof nonce).toBe("string");
  return nonce;
}

function chargedGet(app: App, path: string, xPay: string) {
  return app.inject({
    method: "GET",
    url: path,
    headers: { "user-agent": GPTBOT_UA, "x-payment": xPay },
  });
}

// ---------------------------------------------------------------------------

describe("adversarial payment path", () => {
  it("rejects forged proof", async () => {
    // Facilitator verification fails -> resolveCharge returns
    // "verification-failed" -> 402, never the resource.
    const app = buildAdversarialServer({ facilitatorClient: REJECTING_VERIFIER });
    const nonce = await nonceFrom402(app, "/premium");

    const res = await chargedGet(app, "/premium", xPayment(makeProof({ nonce })));

    expect(res.statusCode).not.toBe(200);
    expect(res.statusCode).toBe(402);
  });

  it("rejects replayed nonce (same nonce twice)", async () => {
    // InMemoryNonceStore.consume() returns true once, false forever after.
    const app = buildAdversarialServer();
    const nonce = await nonceFrom402(app, "/premium");
    const header = xPayment(makeProof({ nonce }));

    const first = await chargedGet(app, "/premium", header);
    const second = await chargedGet(app, "/premium", header);

    expect(first.statusCode).toBe(200); // the one legitimate spend
    expect(second.statusCode).not.toBe(200);
    expect(second.statusCode).toBe(402);
  });

  it.fails("rejects expired proof", async () => {
    // GAP: the middleware has no proof-expiry check. PaymentProofSchema
    // carries no timestamp; resolveCharge never looks at payload.validBefore
    // or requirements.maxTimeoutSeconds. A proof stamped as long-expired is
    // still accepted. Flip to `it(...)` once expiry is enforced.
    const app = buildAdversarialServer();
    const nonce = await nonceFrom402(app, "/premium");
    const expired = makeProof({
      nonce,
      payload: { payer: PAYER, validBefore: "1000000000" /* 2001-09-09 */ },
    });

    const res = await chargedGet(app, "/premium", xPayment(expired));

    expect(res.statusCode).not.toBe(200);
  });

  it.fails("rejects proof for different resource", async () => {
    // GAP: no per-resource binding. The nonce is a bare token in a
    // Set<string>; it is not tied to the URL it was minted for, and the
    // proof has no resource field. A 402 obtained for a cheap path pays for
    // any path.
    const app = buildAdversarialServer();
    const nonce = await nonceFrom402(app, "/cheap");

    const res = await chargedGet(app, "/expensive", xPayment(makeProof({ nonce })));

    expect(res.statusCode).not.toBe(200);
  });

  it.fails("rejects proof for insufficient amount", async () => {
    // GAP: resolveCharge does not compare verification.amount against
    // requirements.maxAmountRequired -- it trusts the facilitator's
    // valid:true. A facilitator (or a compromised one) reporting a
    // 1-atomic-unit payment still unlocks a 10000-unit resource.
    const underpaying: PaymentVerifier = {
      verify: async () => ({ valid: true, payer: PAYER, amount: "1" }),
    };
    const app = buildAdversarialServer({ facilitatorClient: underpaying });
    const nonce = await nonceFrom402(app, "/premium");

    const res = await chargedGet(app, "/premium", xPayment(makeProof({ nonce })));

    expect(res.statusCode).not.toBe(200);
  });

  it.fails("rejects proof for wrong network", async () => {
    // GAP: proof.network is parsed (z.string()) but never checked against
    // publisherConfig.pricing.network. A proof claiming ethereum-mainnet is
    // accepted for a base-sepolia resource.
    const app = buildAdversarialServer();
    const nonce = await nonceFrom402(app, "/premium");

    const res = await chargedGet(
      app,
      "/premium",
      xPayment(makeProof({ nonce, network: "ethereum-mainnet" })),
    );

    expect(res.statusCode).not.toBe(200);
  });

  it("rejects malformed X-Payment header", async () => {
    // parsePaymentProof returns null for bad base64 / bad JSON / schema
    // mismatch -> treated as "no proof" -> 402.
    const app = buildAdversarialServer();
    await nonceFrom402(app, "/premium");

    const notBase64 = await chargedGet(app, "/premium", "%%%not base64%%%");
    const notJson = await chargedGet(app, "/premium", base64UrlEncode("this is not json"));
    const wrongShape = await chargedGet(
      app,
      "/premium",
      base64UrlEncode(JSON.stringify({ hello: "world" })),
    );

    for (const res of [notBase64, notJson, wrongShape]) {
      expect(res.statusCode).not.toBe(200);
      expect(res.statusCode).toBe(402);
    }
  });

  it("does not leak 304 on conditional request from unpaid crawler", async () => {
    // The payment gate runs before any origin fetch or conditional-request
    // handling, so an unpaid crawler sending If-None-Match still gets 402 --
    // never a 304 "not modified" that would let it revalidate a cached copy
    // for free. (A paid crawler gets a full 200, not a 304, either.)
    const app = buildAdversarialServer();

    const unpaid = await app.inject({
      method: "GET",
      url: "/premium",
      headers: { "user-agent": GPTBOT_UA, "if-none-match": '"cached-etag"' },
    });
    expect(unpaid.statusCode).not.toBe(304);
    expect(unpaid.statusCode).not.toBe(200);
    expect(unpaid.statusCode).toBe(402);

    const nonce = await nonceFrom402(app, "/premium");
    const paid = await app.inject({
      method: "GET",
      url: "/premium",
      headers: {
        "user-agent": GPTBOT_UA,
        "x-payment": xPayment(makeProof({ nonce })),
        "if-none-match": '"cached-etag"',
      },
    });
    expect(paid.statusCode).not.toBe(304);
  });

  it("requires site key; empty key returns 401", async () => {
    // /verify-and-price (WordPress Mode B's callout) fails closed when no
    // CRAWLPAY_SITE_KEY is configured -- see SECURITY-REVIEW-NOTES item 8.
    const app = buildAdversarialServer({ siteKey: undefined });

    const noHeader = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      payload: { url: "http://origin.internal/premium" },
    });
    const withHeader = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      headers: { "x-crawlpay-site-key": "anything" },
      payload: { url: "http://origin.internal/premium" },
    });

    expect(noHeader.statusCode).toBe(401);
    expect(withHeader.statusCode).toBe(401);
  });

  it("rejects wrong site key", async () => {
    const app = buildAdversarialServer({ siteKey: "the-real-deploy-key" });

    const wrong = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      headers: { "x-crawlpay-site-key": "not-the-key" },
      payload: { url: "http://origin.internal/premium" },
    });
    const wrongLength = await app.inject({
      method: "POST",
      url: "/verify-and-price",
      headers: { "x-crawlpay-site-key": "the-real-deploy-key-plus-extra" },
      payload: { url: "http://origin.internal/premium" },
    });

    expect(wrong.statusCode).toBe(401);
    expect(wrongLength.statusCode).toBe(401);

    // /stats is guarded by the same check.
    const stats = await app.inject({
      method: "GET",
      url: "/stats",
      headers: { "x-crawlpay-site-key": "not-the-key" },
    });
    expect(stats.statusCode).toBe(401);
  });

  it("rejects another site's key (cross-publisher attempt)", async () => {
    // The middleware is single-tenant: one CRAWLPAY_SITE_KEY. A valid-looking
    // key issued for a different deployment (same length, real format) is
    // still rejected -- there is no shared key namespace to exploit.
    // (Multi-tenant isolation proper is the dashboard's concern, issue #20.)
    const publisherA = buildAdversarialServer({ siteKey: "deploy-key-for-publisher-aaaa" });
    const publisherBKey = "deploy-key-for-publisher-bbbb";

    const crossUse = await publisherA.inject({
      method: "POST",
      url: "/verify-and-price",
      headers: { "x-crawlpay-site-key": publisherBKey },
      payload: { url: "http://origin.internal/premium" },
    });

    expect(crossUse.statusCode).not.toBe(200);
    expect(crossUse.statusCode).toBe(401);
  });
});
