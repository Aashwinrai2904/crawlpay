import {
  CORE_VERSION,
  FacilitatorClient,
  InMemoryNonceStore,
  parsePaymentProof,
  type NonceStore,
  type PaymentVerifier,
} from "@crawlpay/core";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { classifyRequest, resolvePolicy, type BotSignatureConfig } from "./bot-detection";
import {
  cacheMetrics,
  getCachedOrFetch,
  InMemoryCacheStore,
  type CacheStore,
  type LockStore,
} from "./cache";
import { loadPublisherConfig, type PublisherConfig } from "./config/publisher-config";
import { buildPaymentRequirements, respondWithPaymentRequired } from "./payment";
import { fetchFromOrigin, normalizeHeaders, publicUrlFor, respondWithOrigin } from "./proxy";
import {
  CompositeTransactionLog,
  ConsoleTransactionLog,
  PostgresTransactionLog,
  type TransactionLog,
} from "./transactions";

const DEFAULT_ORIGIN_URL = "http://localhost:4000";

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
}

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

  const app = Fastify({ logger: options.logger ?? true });

  app.get("/health", async () => ({
    status: "ok",
    service: "crawlpay-middleware",
    coreVersion: CORE_VERSION,
  }));

  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", "text/plain; version=0.0.4");
    return cacheMetrics.toPrometheusText();
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
    const proof = parsePaymentProof(headers);
    if (!proof) {
      log.info({ paymentOutcome: "missing-proof" }, "payment required");
      return respondWithPaymentRequired(reply, publicUrl, publisherConfig.pricing);
    }

    const nonceIsFresh = await nonceStore.consume(proof.nonce);
    if (!nonceIsFresh) {
      log.info({ paymentOutcome: "invalid-nonce" }, "payment required");
      return respondWithPaymentRequired(reply, publicUrl, publisherConfig.pricing);
    }

    const requirements = buildPaymentRequirements(publicUrl, publisherConfig.pricing, proof.nonce);
    const verification = await facilitatorClient.verify(proof, requirements);

    if (!verification.valid) {
      log.info({ paymentOutcome: "verification-failed" }, "payment required");
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
        amount: verification.amount ?? requirements.maxAmountRequired,
        payer: verification.payer ?? "unknown",
        facilitatorResponse: verification,
      });
    } catch (err) {
      log.error({ err }, "failed to record transaction");
    }
    log.info({ paymentOutcome: "paid", payer: verification.payer }, "payment verified");

    return serveFromOrigin();
  });

  return app;
}
