# Mocks-to-reality audit

A catalog of every mock, fake, stub, and placeholder value in the CrawlPay
repo, and what real thing has to replace it before that part of the system
is actually doing what it appears to do.

**Scope:** this audits `master` as of 2026-09-11 (commit `e04f69a`) — the
code that is actually mergeable and, per `render.yaml`, actually deployed.
Several of this session's own open, unmerged PRs (#25–#31) touch some of
these rows; where relevant that's noted inline, but the table reflects
what's true today, not what those PRs propose.

**"Launch-blocker" means:** this mock is reachable from the live,
deployed path (i.e. it's what `render.yaml` actually wires up), or it's
the default value a real publisher gets without configuring anything, such
that a real crawler or a real publisher would be misled, undercharged, or
never actually paid. Test-file-only fixtures are not launch-blockers by
this definition — they're supposed to be there.

## The two findings that matter most

Everything else in this document is secondary to these two facts, both
verifiable directly in `render.yaml`:

1. **The live, deployed middleware verifies every payment against the mock
   facilitator.** Both `crawlpay-middleware` and
   `crawlpay-middleware-dashboard` set `CRAWLPAY_FACILITATOR_URL` to
   `https://crawlpay-mock-facilitator.onrender.com` — `infra/mock-facilitator`,
   deployed as a real Render service. That facilitator's `/verify` accepts
   *any well-formed* `{ payload, paymentRequirements }` body as valid — "no
   chain, no signature check" per its own source comment. Today, in
   production, any request carrying any syntactically-valid `X-Payment`
   header is treated as a real payment. No money has ever moved.
2. **The live middleware's WordPress config source is a disposable test
   site.** `crawlpay-middleware`'s `CRAWLPAY_WORDPRESS_URL` is
   `https://cpayplugin.s6-tastewp.com` — a free, time-limited throwaway
   WordPress instance from TasteWP's testing service, not a real
   publisher's site. There is currently no real publisher on the other end
   of the "live" deployment.

## The full catalog

| # | Category | What it is | Where it's used | What reality has to replace it | Launch-blocker? |
|---|---|---|---|---|---|
| 1 | Mock facilitator | `infra/mock-facilitator` — Express app, `POST /verify` always returns `{valid:true,...}` for any well-formed body; no blockchain, no signature check | `packages/core/src/facilitator-client.ts` (default `CRAWLPAY_FACILITATOR_URL`), used directly by every middleware test via `mock-facilitator` package, and **deployed to production** as `crawlpay-mock-facilitator` on Render, pointed at by both live middleware services (`render.yaml`) | A real x402 facilitator (e.g. `https://x402.org/facilitator`, or Coinbase's) that actually validates an EIP-3009 signature and settles on-chain. `CRAWLPAY_FACILITATOR_URL` needs to change in `render.yaml`/the Render dashboard, **and** the proof format has to be spec-shaped first (see #5) or a real facilitator will just reject everything | **Yes** |
| 2 | Mock/fake address | `payTo: "0xPUBLISHER00000000000000000000000000000"` — the *default* recipient address | `packages/middleware/config/publisher-config.json` (the production fallback config every middleware loads if not overridden by WordPress/dashboard polling) | A publisher's real payout wallet address. On the WordPress-plugin path there's a real settings field for this (`class-settings.php`); on the dashboard-managed path there is currently **no UI to set it at all** (`Publisher.walletAddress` exists in the schema but nothing writes it — tracked as issue #24) | **Yes** |
| 3 | Mock/fake address | `0xMOCKPAYER00000000000000000000000000000` — the facilitator's fallback "payer" when a proof carries no payer info | `infra/mock-facilitator/src/app.ts` | Not a separate fix — a direct symptom of #1. Once a real facilitator is wired in, this string can never appear; today it *can* show up as the `payer` on a live, "verified" transaction | Yes (via #1, not counted separately) |
| 4 | Mock/fake addresses | Test-fixture addresses: `0xFROMWORDPRESS0000000000000000000000000`, `0xFROMDASHBOARD000000000000000000000000`, `0xTESTPAYEE0000000000000000000000000000000`, `0xPAYER`, and repeated `0xPUBLISHER…`/`0xMOCKPAYER…` literals | ~10 test files across `packages/core`, `packages/middleware`, `packages/dashboard`, `packages/wp-plugin` (`server.test.ts`, `handshake.test.ts`, `facilitator-client.test.ts`, `load-test.ts`, `publisher-config-source.test.ts`, `dashboard-publisher-config-source.test.ts`, `dashboard-transaction-log.test.ts`, `route.test.ts`, `test-rest-config-controller.php`) | Nothing — these are exactly what test fixtures should look like | No |
| 5 | Mock/fake signature | **No signature field exists at all.** `PaymentProofSchema.payload` is `z.record(z.unknown())` — an untyped, unvalidated blob. There is nothing in the wire format to cryptographically verify, even in principle | `packages/core/src/x402.ts`, consumed by `packages/middleware/src/charge.ts` | A real EIP-3009 `{ signature, authorization: { from, to, value, validAfter, validBefore, nonce } }` payload (spec §5.2/§6.1). **A fix for this exists as an open, unmerged PR (#31)** — it also introduces its own placeholder signatures for tests (e.g. `"0x" + "ab".repeat(65)`), which are correctly test-only there | **Yes** |
| 6 | Mock/fake nonce | Server-minted anti-replay `nonce` (`randomUUID()` in `buildPaymentRequirements`) is a CrawlPay-only invention, not part of the x402 spec — the client is never asked to sign it, so echoing it back proves nothing about payment intent. Separately, test-fixture nonce strings (`"already-used-nonce"`, `"fresh-nonce-1"`, `"stats-nonce-1"`, etc.) | `packages/middleware/src/payment.ts`, `packages/middleware/src/charge.ts`; fixtures in `server.test.ts`, `load-test.ts` | The client's own EIP-3009 `authorization.nonce`, once #5 lands (PR #31 already re-points anti-replay at it). The fixture strings need no change | No (mechanism is real, just non-spec; tracked in PR #28's conformance doc) |
| 7 | Test origin | `infra/mock-origin` — a 3-page static Express site (`index.html`, `about.html`, `premium-article.html`) standing in for a publisher's real site | Every middleware test (`server.test.ts`, `load-test.ts`) **and deployed to production** as `crawlpay-mock-origin` on Render, reverse-proxied by the dashboard-managed demo middleware (`ORIGIN_URL` in `render.yaml`) | For tests: nothing, it's correct as-is. For the deployed `crawlpay-middleware-dashboard` service: a real publisher's real site as the reverse-proxy target — today that demo deployment fronts a fake site, not any customer's content | **Yes** (for the deployed demo path only — this is fine for local dev/CI) |
| 8 | In-memory store | `InMemoryNonceStore` — the **production default** (`buildServer()`'s fallback, not test-only). Replay-protection state lives in process memory: a restart or redeploy resets it (a previously-spent nonce becomes spendable again), and it can't be shared across more than one instance | `packages/middleware/src/server.ts`, `packages/core/src/nonce-store.ts` | A shared, persistent store (Redis `SETNX`+TTL, per the code's own `RedisNonceStore` docblock) if the middleware is ever redeployed frequently or scaled beyond one instance. Currently acceptable only because `render.yaml` deliberately runs a single persistent instance | No (deliberate single-instance tradeoff today; becomes a blocker the moment that changes) |
| 9 | In-memory store / dead code | `InMemoryCacheStore` is the **production default**; `RedisCacheStore` is fully implemented but `buildServer()` never constructs it regardless of `CRAWLPAY_REDIS_URL` — Redis "support" is inert | `packages/middleware/src/server.ts`, `packages/middleware/src/cache/redis-cache-store.ts` | Either wire `RedisCacheStore` into `buildServer()` behind `CRAWLPAY_REDIS_URL`, or remove the unused class and stop implying Redis is supported | No |
| 10 | Explicit stub | `RedisNonceStore.consume()` throws `"RedisNonceStore is not implemented yet (Phase 3)"` — has its own test asserting exactly that | `packages/core/src/nonce-store.ts`, `packages/core/src/nonce-store.test.ts` | A real Redis-backed implementation (Phase 3, per the docblock) — never built | No (unused, since #8 is what's actually wired in) |
| 11 | In-memory store | `transactionMetrics` (backing `GET /stats`) — in-memory, since-process-start counters; own comment calls it "a stub per Phase 5's spec, not a query over persisted history" | `packages/middleware/src/transactions/metrics.ts` | A real query over the persisted `transactions` table (Postgres), so the WordPress dashboard widget's numbers survive a restart | No (accuracy/UX issue, not a payment-correctness one) |
| 12 | Placeholder USDC reference | `asset: "USDC"` — a symbol, not the actual token contract address (base-sepolia USDC is `0x036CbD53842c5426634e7929541eC2318f3dCF7e`). Also: no `extra: { name, version }` EIP-712 domain anywhere in the schema/config | Default in `packages/middleware/config/publisher-config.json`, the WordPress plugin's own default (`class-settings.php`), and the dashboard's fallback (`build-config-response.ts`); every test fixture matches | The real per-network token contract address, configurable per publisher, plus `extra.name`/`extra.version` so a real client can build the EIP-712 typed-data domain it needs to sign against. Moot until #1 and #5 land, but blocks the step right after them | **Yes** (once #1/#5 are fixed, this is the next thing that blocks a real payment) |
| 13 | Missing endpoint | **`/settle` does not exist anywhere in this codebase** — zero references in any `.ts` file. `resolveCharge()` treats a `/verify` `isValid:true` as "paid" and stops; nothing is ever broadcast to the chain. The only two mentions of "settle" in the entire repo are in the root `README.md`'s prose, describing what's *supposed* to happen ("checks the proof is real and settles the transfer... verification and settlement are handled by the facilitator") | `packages/middleware/src/charge.ts`, `packages/core/src/facilitator-client.ts` | A `POST /settle` call after a successful `/verify` (spec §7.2), broadcasting the `transferWithAuthorization` and returning `X-PAYMENT-RESPONSE`. Without it, even a fully real, fully signed, fully verified payment never actually transfers USDC | **Yes** |
| 14 | Test-only config, deployed | Live `CRAWLPAY_WORDPRESS_URL=https://cpayplugin.s6-tastewp.com` — a free, auto-expiring throwaway WordPress instance from TasteWP's testing service | `render.yaml` (`crawlpay-middleware`) | A real publisher's real WordPress site with the plugin actually installed, or removal of this env var if no such site exists yet | **Yes** |
| 15 | Test-only config | Site keys and stubbed HTTP calls used only in tests: `"top-secret"`, `"a-different-sites-key"` (`server.test.ts`); PHPUnit's `mock_http_response()` / `'https://middleware.example'` (`test-mode-b-guard.php`) | `packages/middleware/src/server.test.ts`, `packages/wp-plugin/tests/*.php` | Nothing — this is exactly what test fixtures should look like | No |
| 16 | Placeholder config | `.env.example` files' example values (`DATABASE_URL=postgresql://user:password@host:5432/dbname`, blank `NEXTAUTH_SECRET=`, etc.) | `packages/dashboard/.env.example`, `packages/middleware/.env.example` | Nothing — standard practice for an example file, included here to show it was checked and isn't a finding | No |

## Summary

- **16 distinct mocks/fakes/stubs/placeholders cataloged** across the 9 requested categories.
- **6 are launch-blockers** (#1 facilitator, #2 default payout address, #7 demo origin, #12 USDC placeholder, #13 missing `/settle`, #14 disposable WordPress test site) — #3 is a direct symptom of #1 and isn't counted separately.
- **4 are real but limited implementations, not fakes** (#8 in-memory nonce store, #9 in-memory cache store / dead Redis code, #10 the never-built `RedisNonceStore`, #11 in-memory `/stats`) — fine for a single-instance deployment today, worth revisiting before scaling.
- **6 are exactly what they should be** (#4, #6's fixture half, #15, #16, plus the WordPress-plugin path's real payout-wallet field and its bundled bot-signature list, both checked and found to be real, not mocked).

The two production-`render.yaml` findings (#1 and #14) are the ones that matter most: as deployed today, the "live" CrawlPay middleware verifies payment against a facilitator that accepts anything, and its policy/pricing source is a temporary test WordPress site — there is currently no path by which a real crawler paying a real publisher could happen on the live deployment, independent of any code-level gap.
