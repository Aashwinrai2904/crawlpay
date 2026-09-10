# x402 protocol conformance

**Status:** partial. The `402` payment-required manifest is structurally
conformant for the `exact` / `base-sepolia` scheme. The payment-proof format,
the facilitator `/verify` call, and the `/verify` response handling are **not**
conformant — CrawlPay today only interoperates with its own mock facilitator
(`infra/mock-facilitator`), not with a spec-compliant one.

This document records what was tested on **2026-09-10**, against:

- the x402 spec — `coinbase/x402` (redirects to `x402-foundation/x402`),
  `specs/x402-specification-v1.md` + `specs/transports-v1/http.md`;
- the reference TypeScript library — **`x402@1.2.0`** on npm (zod schemas from
  `x402/types`);
- the **live public facilitator** at `https://x402.org/facilitator`.

## 1. What was tested

| # | Check | Method | Result |
|---|---|---|---|
| 1 | Reference client library exists | `npm view x402` | `x402@1.2.0`, exports `PaymentRequirementsSchema`, `PaymentPayloadSchema`, `x402ResponseSchema`, `VerifyRequestSchema`, `VerifyResponseSchema`, `ExactEvmPayloadSchema`, … from `x402/types` |
| 2 | Generate a manifest from `build402Response()` | transpiled `@crawlpay/core`, `middleware` `buildPaymentRequirements()` values from `config/publisher-config.json` | produced |
| 3 | Manifest parses under the reference schema | `x402ResponseSchema.safeParse()` / `PaymentRequirementsSchema.safeParse()` | **passes** with a real `payTo`; fails only on the placeholder address `0xPUBLISHER0000…` |
| 4 | All spec-required `PaymentRequirements` fields present | key check vs spec §5.1.2 | **all 8 present** (`scheme`, `network`, `maxAmountRequired`, `asset`, `payTo`, `resource`, `description`, `maxTimeoutSeconds`) |
| 5 | Field-by-field diff vs spec | zod shape comparison | 1 extra field (`nonce`), 1 missing optional (`outputSchema`), 3 value-level deviations — see §3 |
| 6 | Proof verification against the live base-sepolia facilitator | `POST https://x402.org/facilitator/verify` | facilitator is reachable and returns the spec `/verify` shape; CrawlPay's own request/response format does **not** match it — see §4. A *fully signed* proof was **not** exercised (needs a funded testnet key). |

### The manifest under test

`build402Response(buildPaymentRequirements("https://api.example.com/premium-data"))`:

```json
{
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",
      "resource": "https://api.example.com/premium-data",
      "description": "Access to https://api.example.com/premium-data",
      "mimeType": "text/html",
      "payTo": "0xPUBLISHER00000000000000000000000000000",
      "maxTimeoutSeconds": 60,
      "asset": "USDC",
      "nonce": "ec35dcde-77fa-4900-8554-2a3a3351a016"
    }
  ]
}
```

## 2. What conforms

### The 402 response body

- **Top-level shape.** `{ x402Version, accepts: [...] }` matches
  `PaymentRequirementsResponse` (spec §5.1). `error` is spec-"required" but the
  reference `x402ResponseSchema` treats it as optional; `buildFreshPaymentRequiredResponse()`
  does set it, `build402Response()` alone does not.
- **`x402Version: 1`** — a valid protocol version for the v1 spec.
- **`accepts` is an array** of `PaymentRequirements` objects. ✓

### `PaymentRequirements` — every spec-required field is present and correctly typed

| Field | Spec type | CrawlPay emits | Conforms |
|---|---|---|---|
| `scheme` | `"exact"` enum | `z.literal("exact")` → `"exact"` | ✓ |
| `network` | network enum | `"base-sepolia"` (in the enum) | ✓ (value); schema looser (see §3) |
| `maxAmountRequired` | string, atomic units | `"10000"` | ✓ |
| `asset` | string | `"USDC"` | parses, but see §3 |
| `payTo` | address string | `pricing.payTo` | ✓ **once a real address is configured** |
| `resource` | URL string | the requested URL | ✓ |
| `description` | string | `"Access to <url>"` | ✓ |
| `maxTimeoutSeconds` | number | `60` | ✓ |
| `mimeType` | optional string | `"text/html"` | ✓ (optional) |

With a real EVM `payTo` (e.g. `0x209693Bc6afc0C5328bA36FaF03C514EF312287C`),
**the whole manifest — including CrawlPay's extra `nonce` field — parses cleanly
under `x402@1.2.0`'s `PaymentRequirementsSchema` and `x402ResponseSchema`.** The
only parse failure observed was the literal placeholder value
`0xPUBLISHER00000000000000000000000000000`, which is not a valid address — a
configuration gap (see [`docs`/#24](https://github.com/Aashwinrai2904/crawlpay/issues/24)),
not a format gap.

## 3. What deviates — the 402 manifest

### 3.1 Extra field: `nonce` (additive, non-breaking)

CrawlPay adds a top-level `nonce` to `PaymentRequirements` (a `randomUUID`,
enforced single-use by `InMemoryNonceStore`). **This is not an x402
`PaymentRequirements` field.** The reference schema is non-strict, so it passes
the extra key through silently — no interop break for a compliant client.

The spec's replay protection for the `exact` scheme lives *inside the payment
payload*: `payload.authorization.nonce` (a `bytes32`), signed as part of the
EIP-3009 `TransferWithAuthorization`. CrawlPay's UUID nonce is a parallel,
CrawlPay-only mechanism and is invisible to a standard client (it would never
echo it back the way `parsePaymentProof` expects — see §4.1). This is documented
as intentional in `packages/core/src/x402.ts`.

### 3.2 Missing optional field: `outputSchema`

Spec examples include `"outputSchema": null`. CrawlPay omits it. Optional, so
harmless; adding `outputSchema: null` would match the spec examples byte-for-byte.

### 3.3 `asset` is a symbol, not a contract address

CrawlPay emits `asset: "USDC"`. The spec defines `asset` as the **token
contract address** (for base-sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`).
The reference schema happens to accept the string `"USDC"`, but a facilitator
doing real on-chain verification needs the contract address — `"USDC"` is not
actionable. **Deviation: semantic.** Source: `middleware/config/publisher-config.json`
and the WordPress plugin's `asset` setting default.

### 3.4 Missing `extra` (blocks real payment even though the manifest parses)

For `exact` on EVM, a client signs an EIP-712 `TransferWithAuthorization` and
needs the token's EIP-712 domain `name` and `version`, which the spec carries in
`PaymentRequirements.extra` (`{ "name": "USDC", "version": "2" }`). CrawlPay never
sets `extra`. A spec client that received a CrawlPay 402 could parse it but
**could not construct a valid payment** — it has no domain to sign against.

### 3.5 Looser field schemas (not a wire deviation, a validation gap)

`packages/core/src/x402.ts` types `network`, `asset`, `payTo` as bare
`z.string()`. The reference uses a `network` enum and address regexes for
`payTo`/`asset`. CrawlPay would emit (and, in `parsePaymentProof`, accept)
values a compliant implementation rejects. Tightening these is low-risk and
would catch the `0xPUBLISHER…` placeholder and the `asset: "USDC"` issue at the
schema boundary.

### 3.6 Protocol version / network identifier drift

The live `https://x402.org/facilitator/supported` now advertises
**`x402Version: 2`** and **CAIP-2 network ids** (`eip155:84532`, not
`base-sepolia`). CrawlPay is built to the **v1** spec (`x402Version: 1`,
`network: "base-sepolia"`). Many facilitators still accept v1, and the v1 spec
markdown is still published, but the reference public facilitator has moved on.

## 4. What deviates — proof verification (the significant gap)

### 4.1 The payment-proof format is not x402

`packages/core/src/x402.ts` `PaymentProofSchema`:

```
{ x402Version, scheme: "exact", network, nonce, payload: Record<string, unknown> }
```

vs the spec `PaymentPayload` (§5.2):

```
{ x402Version, scheme, network, payload: { signature, authorization: {
    from, to, value, validAfter, validBefore, nonce } } }
```

- CrawlPay's proof has a **top-level `nonce`** that x402 does not (see §3.1).
- CrawlPay's `payload` is **`Record<string, unknown>` — unvalidated**. The source
  comment says *"Opaque until Phase 2"*. In practice the mock facilitator only
  reads `payload.payer`, and CrawlPay's own client-side (tests / `test-mode-a.sh`)
  sends `payload: { payer: "0x…" }`.
- There is **no signature and no EIP-3009 authorization** anywhere in a CrawlPay
  proof. Nothing is signed; nothing is verifiable on-chain.

Passing a well-formed CrawlPay proof to `x402@1.2.0`'s `PaymentPayloadSchema`
**fails**: `path=["payload"] code=invalid_union` — the payload matches neither
`ExactEvmPayloadSchema` (`{signature, authorization}`) nor the SVM variant.

### 4.2 The facilitator `/verify` request shape is wrong

`packages/core/src/facilitator-client.ts` `verify()` POSTs:

```json
{ "payload": <proof>, "paymentRequirements": <requirements> }
```

The spec (§7.1) and `x402@1.2.0`'s `VerifyRequestSchema` expect:

```json
{ "x402Version": 1, "paymentPayload": <PaymentPayload>, "paymentRequirements": <PaymentRequirements> }
```

- key **`payload` should be `paymentPayload`**;
- **`x402Version` is missing** at the top level.

`VerifyRequestSchema.safeParse()` on CrawlPay's body fails with
`path=["paymentPayload"] code=invalid_type: Required`.

### 4.3 The facilitator `/verify` response shape is misread

Live probe — `POST https://x402.org/facilitator/verify` with a spec-shaped but
unsigned payload returned:

```json
{ "isValid": false, "invalidReason": "invalid_exact_evm_signature",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66" }
```

That is the spec §7.1 / `x402@1.2.0` `VerifyResponseSchema` shape:
`{ isValid, invalidReason?, payer }`.

CrawlPay's `VerificationResultSchema` is `{ valid, amount?, payer?, error? }`:

- **`valid` vs `isValid`** — different key, and CrawlPay's is a *required*
  boolean;
- **`error` vs `invalidReason`**;
- CrawlPay expects an `amount` the spec response does not carry.

`VerificationResultSchema.safeParse({ isValid: true, payer })` **fails**
(`valid` — Required). So `FacilitatorClient.verify()` given a real facilitator's
response returns `{ valid: false, error: "facilitator returned a malformed
response" }` — i.e. **CrawlPay treats every response from a spec-compliant
facilitator as a verification failure.** It only works against
`infra/mock-facilitator`, which returns `{ valid, amount, payer }`.

### 4.4 No `/settle` step

x402 is `/verify` → then `/settle` (broadcast the `transferWithAuthorization`
on-chain). `resolveCharge()` calls **only `/verify`** and treats `valid: true`
as "paid". CrawlPay never settles, so **no USDC ever moves** even in a
fully-wired setup. The mock facilitator has no `/settle` route either.

## 5. Summary

| Area | Verdict |
|---|---|
| 402 body top-level (`x402Version`, `accepts`) | **conforms** |
| `PaymentRequirements` required fields present & typed | **conforms** (with a real `payTo`) |
| `PaymentRequirements` extra `nonce` field | deviates, additive, non-breaking |
| `asset` as symbol not contract address | deviates (semantic) |
| Missing `extra` (EIP-712 domain) | gap — blocks real client payment |
| `network`/`payTo`/`asset` schema validation | looser than spec |
| x402 version / CAIP-2 networks | CrawlPay is v1; public facilitator is v2 |
| Payment-proof format (`PaymentPayload`) | **does not conform** — no signature, no EIP-3009 authorization, unvalidated `payload`, extra `nonce` |
| Facilitator `/verify` request (`paymentPayload`, `x402Version`) | **does not conform** — wrong key, missing field |
| Facilitator `/verify` response handling (`isValid`/`invalidReason`) | **does not conform** — CrawlPay reads `valid`/`error`; would reject every real response |
| `/settle` | **not implemented** |

**Bottom line:** the *advertising* side (the 402 manifest) is close to
spec-compliant and a real x402 client can parse it. The *settlement* side (proof
format, facilitator protocol) is a mock-only stub — the code comment in
`packages/core/src/x402.ts` claiming a real facilitator or client "can speak
this without translation" is inaccurate for everything past the 402 body.

## 6. Suggested follow-ups (not in this PR)

1. Adopt the spec `PaymentPayload` (`{ signature, authorization }`) for the
   `exact` EVM scheme; drop the top-level `nonce` or keep it only as a CrawlPay
   internal keyed off `authorization.nonce`.
2. `FacilitatorClient`: send `{ x402Version, paymentPayload, paymentRequirements }`;
   parse `{ isValid, invalidReason, payer }`. Update `infra/mock-facilitator` and
   the middleware tests to the same shape.
3. Add `/settle` (verify → settle → return `X-PAYMENT-RESPONSE`).
4. `PaymentRequirements`: emit `asset` as the token contract address, add
   `extra: { name, version }`, add `outputSchema: null`; tighten
   `network`/`payTo`/`asset` schemas.
5. Decide v1 vs v2 (CAIP-2 network ids, `x402Version: 2`).

## Appendix — reproducing this

```bash
mkdir /tmp/x402-conf && cd /tmp/x402-conf && npm init -y
npm i x402@1.2.0 zod@3.23.8
# transpile packages/core/src/{x402,utils,proof,response}.ts to ESM .js, then:
node --input-type=module -e '
import { PaymentRequirementsSchema, x402ResponseSchema, PaymentPayloadSchema,
         VerifyRequestSchema, VerifyResponseSchema } from "x402/types";
// build the manifest exactly as middleware buildPaymentRequirements + build402Response do,
// then PaymentRequirementsSchema.safeParse(accepts[0]) etc.
'
curl -s https://x402.org/facilitator/supported
curl -s -X POST https://x402.org/facilitator/verify -H content-type:application/json -d '<spec-shaped body>'
```
