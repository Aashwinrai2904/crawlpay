import Fastify from "fastify";
import { CORE_VERSION } from "@crawlpay/core";
import { cacheMetrics } from "./cache";

// Phase 1-4 reverse-proxy / x402 challenge-response logic goes here.
// This is scaffolding only beyond health/metrics: the bot-detection and
// cache modules exist as libraries under src/ but aren't wired into
// request handling yet — that's Phase 4.

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  service: "crawlpay-middleware",
  coreVersion: CORE_VERSION,
}));

app.get("/metrics", async (_request, reply) => {
  reply.header("content-type", "text/plain; version=0.0.4");
  return cacheMetrics.toPrometheusText();
});

const port = Number(process.env.PORT ?? 8787);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
