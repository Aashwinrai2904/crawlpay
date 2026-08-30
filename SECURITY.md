# Security

## Reporting a vulnerability

Please don't open a public GitHub issue for a genuine security vulnerability. Instead, open a
[private security advisory](../../security/advisories/new) on this repository, or contact the
maintainer directly. Include what you found, how to reproduce it, and its likely impact — a
working repro speeds up triage a lot.

This is a young project without a formal disclosure SLA yet; expect a response, not necessarily a
fast one.

## Known issues

This project keeps a running, honest log of known gaps in
[SECURITY-REVIEW-NOTES.md](SECURITY-REVIEW-NOTES.md) — flagged during implementation rather than
hidden until an eventual audit. The summary below is current as of this writing; the linked file
has full detail (affected code, exact risk, suggested fix) per item.

| # | Area | Risk | Status |
|---|------|------|--------|
| 1 | `Signature-Agent` header (Web Bot Auth) | Client-supplied URL is fetched server-side with only a scheme check — SSRF surface | Open |
| 2 | JWKS directory response | Not verified as signed per the Web Bot Auth spec — a compromised directory host could serve spoofed keys | Open |
| 3 | RFC 9421 signature parser | Covers a scoped subset only (single signature, specific components) — fails closed on anything else, but narrows real-world compatibility | Open |
| 4 | Bot Auth body/content-digest | Not implemented — a signature can't be trusted to cover the request body | Open |
| 5 | Mode B (WordPress, no reverse proxy) bot detection | User-Agent-only, inherently spoofable — no cryptographic verification available in PHP | Open (accepted limitation of Mode B; Mode A doesn't have this gap) |
| 6 | Bot signature lists (Node vs. PHP) | Manually synced, no automated check that they stay in agreement | Open |
| 7 | Mode B middleware-unreachable behavior | Fails open (serves unmetered) rather than blocking — a deliberate availability-over-revenue tradeoff, but silent (no alerting) | Open |
| 8 | `/stats`, `/verify-and-price`, WP REST config endpoint auth | Were open by default with no site key configured | **Fixed** — both now fail closed (401) with no key configured; see negative tests in `server.test.ts` and `test-rest-config-controller.php` |
| 9 | Dashboard tenant isolation | Application-level only (every `requirePublisher()`/`requireOwnedSite()` call), no database-level backstop (no RLS-equivalent path exists given the architecture) | Open |
| 10 | Deploy key storage | Stored in plaintext in Postgres | Partially resolved — a "Regenerate deploy key" action now exists (no more delete-and-recreate-the-Site workaround), scoped so a publisher can only rotate their own site's key. Plaintext storage itself is still open. |
| 11 | `/api/v1/config`, `/api/v1/transactions` rate limiting | No request-rate limits on either endpoint | Open |

## Supported versions

Pre-1.0 — only the latest tagged release and `master` are supported. No backport policy yet.
