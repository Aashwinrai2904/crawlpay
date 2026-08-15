import { timingSafeEqual } from "node:crypto";
import {
  CORE_VERSION,
  FacilitatorClient,
  InMemoryNonceStore,
  type NonceStore,
  type PaymentVerifier,
} from "@crawlpay/core";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { z } from "zod";
import { resolveCharge } from "./charge";
import { classifyRequest, resolvePolicy, type BotSignatureConfig } from "./bot-detection";
import {
  cacheMetrics,
  getCachedOrFetch,
  InMemoryCacheStore,
  type CacheStore,
  type LockStore,
} from "./cache";
import { loadPublisherConfig, type PublisherConfig } from "./config/publisher-config";
import { respondWithPaymentRequired } from "./payment";
import { fetchFromOrigin, normalizeHeaders, publicUrlFor, respondWithOrigin } from "./proxy";
import {
  CompositeTransactionLog,
  ConsoleTransactionLog,
  PostgresTransactionLog,
  transactionMetrics,
  type TransactionLog,
} from "./transactions";

const DEFAULT_ORIGIN_URL = "http://localhost:4000";
const SITE_KEY_HEADER = "x-crawlpay-site-key";

export interface BuildServerOptions {
  originBaseUrl?: string;
  publisherConfig?: PublisherConfig;
  botSignatureConfig?: BotSignatureConfig;
  cacheStore?: CacheStore & LockStore;
  nonceStore?: NonceStore;
  facilitatorClient?: PaymentVerifier;
  transactionLog?: TransactionLog;
  fetchImpl?: typeof fetch;
  logger?: FastifyServerOptions["logger"];
  /**
   * Shared secret the WordPress plugin (Mode B) and any other external
   * caller must present via X-Crawlpay-Site-Key to use /stats and
   * /verify-and-price. Defaults to CRAWLPAY_SITE_KEY; if neither is set,
   * those endpoints are open — fine for local dev, not for production.
   */
  siteKey?: string;
}

const VerifyAndPriceRequestSchema = z.object({
  url: z.string().url(),
  paymentProofHeader: z.string().optional(),
});

/**
 * Composes Phases 1-3 into the actual request pipeline: classify -> resolve
 * policy -> allow (cache-through) / block (403) / charge (402 handshake,
 * then cache-through once paid). Everything is constructor-injectable so
 * tests don't need a live Redis/Postgres/facilitator/origin.
 */
export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const originBaseUrl = options.originBaseUrl ?? process.env.ORIGIN_URL ?? DEFAULT_ORIGIN_URL;
  const publisherConfig = options.publisherConfig ?? loadPublisherConfig();
  const botSignatureConfig = options.botSignatureConfig;
  const cacheStore = options.cacheStore ?? new InMemoryCacheStore();
  const nonceStore = options.nonceStore ?? new InMemoryNonceStore();
  const facilitatorClient = options.facilitatorClient ?? new FacilitatorClient();
  const transactionLog =
    options.transactionLog ??
    new CompositeTransactionLog([new ConsoleTransactionLog(), new PostgresTransactionLog()]);
  const fetchImpl = options.fetchImpl ?? fetch;
  const siteKey = options.siteKey ?? process.env.CRAWLPAY_SITE_KEY;

  const app = Fastify({ logger: options.logger ?? true });

  function isAuthorized(headers: Record<string, string>): boolean {
    if (!siteKey) {
      return true;
    }
    const provided = headers[SITE_KEY_HEADER];
    if (typeof provided !== "string") {
      return false;
    }
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(siteKey);
    return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
  }

  app.get("/health", async () => ({
    status: "ok",
    service: "crawlpay-middleware",
    coreVersion: CORE_VERSION,
  }));

  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", "text/plain; version=0.0.4");
    return cacheMetrics.toPrometheusText();
  });

  // Consulted by the WordPress plugin's dashboard widget (Mode A and B
  // both). Not the same thing as /metrics: JSON, not Prometheus text, and
  // meant for a human-facing summary rather than a scraper.
  app.get("/stats", async (request, reply) => {
    if (!isAuthorized(normalizeHeaders(request.headers))) {
      reply.code(401);
      return { error: "unauthorized" };
    }
    return {
      cache: { hits: cacheMetrics.hitCount, misses: cacheMetrics.missCount },
      revenue: transactionMetrics.snapshot(),
    };
  });

  // Synchronous charge check for WordPress Mode B (shared hosting, can't
  // reverse-proxy): WP already did its own lightweight UA-based
  // classification and only calls this once it believes a request is an
  // ai-crawler under a "charge" policy. This endpoint owns the actual
  // payment decision (proof parsing, nonce consumption, facilitator
  // verification) via the same resolveCharge() the main route uses, so
  // Mode A and Mode B can never disagree about what counts as a valid
  // payment.
  app.post("/verify-and-price", async (request, reply) => {
    if (!isAuthorized(normalizeHeaders(request.headers))) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const parsed = VerifyAndPriceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid request body" };
    }

    const decision = await resolveCharge(parsed.data.url, parsed.data.paymentProofHeader, {
      nonceStore,
      facilitatorClient,
      pricing: publisherConfig.pricing,
    });

    if (decision.outcome !== "paid") {
      return { action: "charge", paymentRequired: decision.response.body };
    }

    try {
      await transactionLog.record({
        timestamp: new Date(),
        url: parsed.data.url,
        // WordPress only calls this endpoint for its own ai-crawler match;
        // resolveCharge doesn't re-derive a classification.
        botClassification: "ai-crawler",
        amount: decision.verification.amount ?? decision.requirements.maxAmountRequired,
        payer: decision.verification.payer ?? "unknown",
        facilitatorResponse: decision.verification,
      });
    } catch (err) {
      request.log.error({ err }, "failed to record transaction");
    }
    transactionMetrics.record(
      "ai-crawler",
      decision.verification.amount ?? decision.requirements.maxAmountRequired,
    );

    return { action: "allow" };
  });

  app.get("/*", async (request, reply) => {
    const headers = normalizeHeaders(request.headers);
    const classification = classifyRequest(headers, request.ip, botSignatureConfig);
    const action = resolvePolicy(classification, publisherConfig.policy);
    const publicUrl = publicUrlFor(request);
    const log = request.log.child({ classification, action, path: request.url });

    const serveFromOrigin = async () => {
      try {
        const result = await getCachedOrFetch(
          publicUrl,
          () => fetchFromOrigin(fetchImpl, originBaseUrl, request.url),
          { store: cacheStore },
        );
        log.info({ cacheHit: result.cacheHit }, "served");
        return respondWithOrigin(reply, result);
      } catch (err) {
        log.error({ err }, "origin fetch failed");
        reply.code(502);
        return { error: "bad gateway" };
      }
    };

    if (action === "block") {
      log.info("blocked");
      reply.code(403);
      return { error: "forbidden" };
    }

    if (action === "allow") {
      return serveFromOrigin();
    }

    // action === "charge"
    const decision = await resolveCharge(publicUrl, headers["x-payment"], {
      nonceStore,
      facilitatorClient,
      pricing: publisherConfig.pricing,
    });

    if (decision.outcome !== "paid") {
      log.info({ paymentOutcome: decision.outcome }, "payment required");
      return respondWithPaymentRequired(reply, publicUrl, publisherConfig.pricing);
    }

    // The payment already verified successfully — a logging/audit-trail
    // failure (e.g. Postgres unreachable) must never turn that into a
    // failed request for a crawler that legitimately paid.
    try {
      await transactionLog.record({
        timestamp: new Date(),
        url: publicUrl,
        botClassification: classification,
        amount: decision.verification.amount ?? decision.requirements.maxAmountRequired,
        payer: decision.verification.payer ?? "unknown",
        facilitatorResponse: decision.verification,
      });
    } catch (err) {
      log.error({ err }, "failed to record transaction");
    }
    transactionMetrics.record(
      classification,
      decision.verification.amount ?? decision.requirements.maxAmountRequired,
    );
    log.info({ paymentOutcome: "paid", payer: decision.verification.payer }, "payment verified");

    return serveFromOrigin();
  });

  return app;
}
