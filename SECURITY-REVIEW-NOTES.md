# Security Review Notes

Running log of known gaps and risks flagged during implementation. Items are
appended as they're discovered during each phase, not resolved inline unless
noted — the intent is that nothing gets lost before the Phase 8 security
review. Do not delete an entry without recording its resolution; move it to
"Resolved" instead.

Each entry: what/where, why it matters, what a fix would look like, phase it
was flagged in.

## Open items

### 1. `signature-agent` SSRF risk

- **File/function:** `packages/middleware/src/bot-detection/verify-bot-auth.ts` — `verifyBotAuthSignature` / `fetchJwkByThumbprint`
- **Flagged in:** Phase 2
- **Risk:** The JWKS directory URL fetched to verify a bot's signature comes directly from the client-supplied `Signature-Agent` request header. A request can point this at an arbitrary HTTPS URL, making the middleware's own server perform an outbound fetch to attacker-chosen targets — a classic SSRF vector (internal services, cloud metadata endpoints, etc.), gated only by a scheme check (`https:` required) which doesn't constrain the host.
- **Suggested fix:** Allowlist known/registered bot-identity domains before fetching, and/or resolve+validate the target IP isn't in a private/link-local range (defends against DNS rebinding) before connecting.

### 2. JWKS directory response isn't verified as signed

- **File/function:** `packages/middleware/src/bot-detection/verify-bot-auth.ts` — `fetchJwkByThumbprint`
- **Flagged in:** Phase 2
- **Risk:** Web Bot Auth's spec expects the JWKS directory response itself to be signed, specifically so it can't be mirrored and re-hosted under a different identity. This implementation only checks that a returned key's own RFC 7638 thumbprint matches the requested `keyid` — it does not verify the directory response's signature, so a compromised or spoofed directory host could serve attacker-controlled keys under a mirrored identity.
- **Suggested fix:** Verify the directory response's own signature per the Web Bot Auth spec before trusting any key inside it.

### 3. RFC 9421 parser covers a scoped subset only

- **File/function:** `packages/middleware/src/bot-detection/signature-base.ts` — `parseSignatureInput`, `buildSignatureBase`
- **Flagged in:** Phase 2
- **Risk:** This is not a general RFC 8941 structured-field parser. It supports exactly one signature label per `Signature-Input` header (no multi-signature dictionaries) and covered components limited to the derived components (`@method`, `@authority`, `@target-uri`, `@path`, `@scheme`, `@query`) plus plain header fields — no structured field parameters (`;req`, `sf`, `key`, `bs`). A signer using any unsupported construct will simply fail verification (fails closed, not a bypass), but this narrows real-world compatibility and should be checked against whatever signer implementations crawlpay actually needs to interoperate with.
- **Suggested fix:** Either confirm the target bot identities never use the unsupported constructs, or extend the parser to a fuller RFC 8941 implementation (ideally via a vetted library rather than hand-rolled).

### 4. `body`/content-digest verification not implemented

- **File/function:** `packages/middleware/src/bot-detection/verify-bot-auth.ts` — `verifyBotAuthSignature`
- **Flagged in:** Phase 2
- **Risk:** `BotAuthVerifyRequest` accepts a `body` field, but nothing in the current implementation covers it — there's no support for verifying a `content-digest` header against the actual request body. A signature that doesn't cover the body (or covers it via a digest header we don't check) can't be trusted to guarantee the body wasn't tampered with in transit to the origin.
- **Suggested fix:** Implement RFC 9530 `Content-Digest` verification and require it as a covered component whenever a request has a body.

### 5. Mode B bot detection is User-Agent-only and inherently spoofable

- **File/function:** `packages/wp-plugin/includes/class-bot-signatures.php` — `Bot_Signatures::is_ai_crawler()`, `packages/wp-plugin/includes/class-mode-b-guard.php` — `Mode_B_Guard::decide()`
- **Flagged in:** Phase 5 (explicitly called out as an accepted, unavoidable limitation in the Phase 5 spec itself — logged here so it's on record for the Phase 8 review, not because it's news)
- **Risk:** Mode B (the shared-hosting fallback, no reverse proxy) classifies traffic purely by matching the `User-Agent` header against a bundled list — there is no cryptographic verification available in PHP for this phase, unlike the middleware's RFC 9421 `verifyBotAuthSignature()`. Anyone can set an arbitrary `User-Agent` string, so Mode B's "ai-crawler" charge gate can be bypassed entirely by not claiming to be a crawler, or triggered spuriously by anyone who does claim to be one.
- **Suggested fix:** None available in pure PHP for this phase. The real fix is migrating the site to Mode A (reverse proxy in front of the middleware), which does have Web Bot Auth verification. Worth an explicit product decision on how prominently Mode B's weaker guarantee should be surfaced to site owners (the settings page already states this; consider whether that's sufficient).

### 6. `data/bot-signatures.json` (PHP) has no automated sync with the Node copy

- **File/function:** `packages/wp-plugin/data/bot-signatures.json` vs. `packages/middleware/config/bot-signatures.json`
- **Flagged in:** Phase 5
- **Risk:** The plugin ships a manually-copied snapshot of the Node middleware's crawler signature list. If the Node list is updated (new crawler added/renamed) and the PHP copy isn't updated in lockstep, Mode A and Mode B will classify the same request differently — e.g. a newly-added AI crawler gets charged by the middleware but passes through free on a Mode B site, or vice versa.
- **Suggested fix:** A build step that generates the PHP copy from the Node JSON at release time (even a trivial copy-and-check-in script), or a CI check that fails if the two files diverge.

### 7. Mode B fails open when the middleware is unreachable

- **File/function:** `packages/wp-plugin/includes/class-mode-b-guard.php` — `Mode_B_Guard::decide_with_proof()`, `decide_without_proof()`
- **Flagged in:** Phase 5
- **Risk:** If `/verify-and-price` can't be reached (network issue, middleware down/restarting), Mode B lets the request through unmetered rather than blocking it. This was a deliberate choice — the alternative (fail closed) risks serving 402s to legitimate crawlers or making the site look broken during a routine middleware restart — but it does mean any middleware outage is a direct revenue leak with no alerting built in. Worth explicit product sign-off rather than just an engineering default.
- **Suggested fix:** At minimum, log these fail-open events somewhere visible (currently they're silent from WordPress's perspective); consider whether a persistent/extended outage should eventually flip to fail-closed.

### 8. `/stats`, `/verify-and-price`, and the REST config endpoint are open by default

- **File/function:** `packages/middleware/src/server.ts` — `isAuthorized()`; `packages/wp-plugin/includes/class-rest-config-controller.php` — `check_permission()`
- **Flagged in:** Phase 5
- **Risk:** All three endpoints only require the `X-Crawlpay-Site-Key` shared secret if one has been configured; with none set (the out-of-the-box default), they're fully open. `/stats` and the REST config endpoint leak revenue/traffic data and pricing/payout-address configuration; `/verify-and-price` can be hit directly by anyone to trigger real facilitator verification calls and nonce consumption, bypassing WordPress's own classification entirely.
- **Suggested fix:** Consider making the site key mandatory (refuse to serve these routes at all without one configured) rather than silently falling back to open, at least for production-flagged deployments.

## Resolved items

_(none yet)_
