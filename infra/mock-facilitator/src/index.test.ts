import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("mock-facilitator", () => {
  it("verifies a well-formed payment payload", async () => {
    const response = await request(buildApp())
      .post("/verify")
      .send({
        x402Version: 1,
        paymentPayload: {
          x402Version: 1,
          scheme: "exact",
          network: "base-sepolia",
          payload: { signature: "0xabc", authorization: { from: "0xPAYER" } },
        },
        paymentRequirements: { maxAmountRequired: "1000" },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ isValid: true, payer: "0xPAYER" });
  });

  it("falls back to the mock payer when the payload carries no authorization.from", async () => {
    const response = await request(buildApp())
      .post("/verify")
      .send({
        x402Version: 1,
        paymentPayload: { x402Version: 1, scheme: "exact", network: "base-sepolia", payload: {} },
        paymentRequirements: { maxAmountRequired: "1000" },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      isValid: true,
      payer: "0xMOCKPAYER00000000000000000000000000000",
    });
  });

  it("rejects a malformed body", async () => {
    const response = await request(buildApp()).post("/verify").send({});
    expect(response.status).toBe(400);
    expect(response.body.isValid).toBe(false);
  });

  it("returns a price quote", async () => {
    const response = await request(buildApp()).get("/price-quote");
    expect(response.status).toBe(200);
    expect(response.body.asset).toBe("USDC");
  });
});
