# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-08-30

First tagged release. Everything up to this point was iterative in-repo development without
version discipline — this tag marks the first point the project is considered installable by
someone outside the team.

### Added
- Core x402 protocol handling (`packages/core`): classification, payment handshake, nonce store,
  facilitator client.
- Middleware (`packages/middleware`): reverse-proxy request pipeline (classify → allow/block/charge),
  Web Bot Auth (RFC 9421) signature verification, response caching, Postgres transaction logging,
  config sourced from either a WordPress site or the publisher dashboard.
- Publisher dashboard (`packages/dashboard`): magic-link auth, per-site pricing/policy management,
  revenue and transaction views, deploy key issuance and rotation.
- WordPress plugin (`packages/wp-plugin`): Mode A (reverse proxy) and Mode B (shared-hosting,
  User-Agent-based) integration paths, Settings page, per-post price overrides, dashboard widget.
- `render.yaml` Render blueprint for a dashboard-managed middleware deployment.
- Root `LICENSE` (MIT, with `packages/wp-plugin` separately GPL-2.0-or-later for WordPress.org
  compatibility), `SECURITY.md`, `CONTRIBUTING.md`, `.env.example` for every package that reads
  environment variables.

### Fixed
- `/stats`, `/verify-and-price` (middleware), and the WordPress REST config endpoint no longer
  fail open when no site key is configured — all three now refuse requests (401) instead of
  silently serving them. See `SECURITY-REVIEW-NOTES.md`.
- Magic-link sign-in now works for any publisher, not just the account Resend's testing address
  is registered to (crawlpay.pro verified as a sending domain).
- `Running locally`: the two documented steps (`docker compose up`, then `pnpm dev`) previously
  both tried to start `mock-origin`/`mock-facilitator` on the same ports. Docker Compose now
  starts only `redis`/`postgres`; `pnpm dev` owns the rest.
- WordPress plugin's `build/build.sh` wasn't executable.
