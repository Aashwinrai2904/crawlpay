import Fastify from "fastify";
import { CORE_VERSION } from "@crawlpay/core";

// Phase 1-4 reverse-proxy / x402 challenge-response logic goes here.
// This is scaffolding only: a health check and nothing else.

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  service: "crawlpay-middleware",
  coreVersion: CORE_VERSION,
}));

const port = Number(process.env.PORT ?? 8787);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
