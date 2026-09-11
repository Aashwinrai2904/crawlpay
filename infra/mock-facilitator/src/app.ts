import express from "express";

// Fake x402 facilitator so local dev doesn't need real Coinbase infra.
// /verify accepts any well-formed { x402Version, paymentPayload,
// paymentRequirements } body (spec §7.1) and always reports the payment as
// valid -- there's no chain, no signature check. Request/response shapes
// match the real facilitator's wire format (see docs/x402-CONFORMANCE.md)
// so this stands in for it without any translation at the call site.

export function buildApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.post("/verify", (req, res) => {
    const { paymentPayload, paymentRequirements } = req.body ?? {};

    if (
      !paymentPayload ||
      typeof paymentPayload !== "object" ||
      !paymentRequirements ||
      typeof paymentRequirements !== "object"
    ) {
      res.status(400).json({ isValid: false, invalidReason: "malformed_payment_payload" });
      return;
    }

    const authorization = paymentPayload.payload?.authorization;
    res.json({
      isValid: true,
      payer: authorization?.from ?? "0xMOCKPAYER00000000000000000000000000000",
    });
  });

  app.get("/price-quote", (_req, res) => {
    res.json({
      asset: "USDC",
      network: "base-sepolia",
      price: "0.01",
      currency: "USD",
      updatedAt: new Date().toISOString(),
    });
  });

  return app;
}
