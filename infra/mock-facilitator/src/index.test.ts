import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

function buildApp() {
  const app = express();
  app.use(express.json());

  app.post("/verify", (req, res) => {
    const { payload, paymentRequirements } = req.body ?? {};
    if (
      !payload ||
      typeof payload !== "object" ||
      !paymentRequirements ||
      typeof paymentRequirements !== "object"
    ) {
      res.status(400).json({ valid: false, error: "malformed payment proof" });
      return;
    }
    res.json({
      valid: true,
      amount: paymentRequirements.maxAmountRequired ?? "0",
      payer: payload.payer ?? "0xMOCKPAYER00000000000000000000000000000",
    });
  });

  app.get("/price-quote", (_req, res) => {
    res.json({ asset: "USDC", network: "base-sepolia", price: "0.01", currency: "USD" });
  });

  return app;
}

describe("mock-facilitator", () => {
  it("verifies a well-formed payment proof", async () => {
    const response = await request(buildApp())
      .post("/verify")
      .send({ payload: { payer: "0xabc" }, paymentRequirements: { maxAmountRequired: "1000" } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ valid: true, amount: "1000", payer: "0xabc" });
  });

  it("rejects a malformed body", async () => {
    const response = await request(buildApp()).post("/verify").send({});
    expect(response.status).toBe(400);
    expect(response.body.valid).toBe(false);
  });

  it("returns a price quote", async () => {
    const response = await request(buildApp()).get("/price-quote");
    expect(response.status).toBe(200);
    expect(response.body.asset).toBe("USDC");
  });
});
