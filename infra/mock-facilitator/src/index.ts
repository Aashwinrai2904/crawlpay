import express from "express";

// Fake x402 facilitator so local dev doesn't need real Coinbase infra.
// /verify accepts any well-formed { payload, paymentRequirements } body and
// always reports the payment as valid — there's no chain, no signature check.

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4100);

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
  res.json({
    asset: "USDC",
    network: "base-sepolia",
    price: "0.01",
    currency: "USD",
    updatedAt: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`mock-facilitator listening on :${PORT}`);
});
