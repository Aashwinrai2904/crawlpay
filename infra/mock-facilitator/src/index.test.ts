import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

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
