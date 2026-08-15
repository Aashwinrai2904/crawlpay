import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { CORE_VERSION } from "@crawlpay/core";

describe("health check", () => {
  it("returns ok with the core version", async () => {
    const app = Fastify();
    app.get("/health", async () => ({ status: "ok", coreVersion: CORE_VERSION }));

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", coreVersion: CORE_VERSION });
  });
});
