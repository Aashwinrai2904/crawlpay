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

## Resolved items

_(none yet)_
