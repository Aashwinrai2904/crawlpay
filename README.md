# CrawlPay

Lets publishers charge AI crawlers per request over the [x402](https://www.x402.org/) protocol,
instead of letting them scrape content for free. A publisher sets a price and a payout wallet; an
AI crawler that wants the content either pays that price in USDC or gets nothing — human visitors
and search engines pass through untouched.

Three pieces work together:

- **The publisher dashboard** (`packages/dashboard`) — where a publisher signs in, adds a site,
  sets pricing/policy per bot type, and watches revenue come in.
- **The WordPress plugin** (`packages/wp-plugin`) — the easiest way to connect a site to CrawlPay.
  See [Installing the WordPress plugin](#installing-the-wordpress-plugin) below.
- **The middleware** (`packages/middleware`) — the piece that actually classifies traffic, runs
  the x402 payment handshake, and enforces the policy. Either the WordPress plugin talks to it, or
  it runs as a standalone reverse proxy in front of any site.

## How x402 works here

[x402](https://www.x402.org/) is an open protocol for HTTP-native micropayments, built on the
web's own (long-unused) `402 Payment Required` status code. CrawlPay's request flow:

1. A request comes in. CrawlPay classifies it as **human**, **search crawler**, **AI crawler**, or
   **unknown bot** (User-Agent plus, where available, [Web Bot Auth](https://web-bot-auth.org/)
   signature verification — a stronger signal than User-Agent alone, which is trivially spoofable).
2. The publisher's policy decides what happens to that classification: **allow** (serve normally —
   the default for humans and search engines, so SEO is never affected), **block** (403, no
   content, no charge), or **charge** (the default for AI crawlers).
3. On `charge`, CrawlPay responds `402 Payment Required` with a JSON body naming the price, the
   asset (USDC), the network, and the publisher's payout address — this *is* the x402 protocol's
   payment-required response shape, not a CrawlPay-specific format.
4. A crawler that wants to pay resubmits the same request with an `X-Payment` header containing a
   payment proof. CrawlPay verifies it against a facilitator (the service that checks the proof is
   real and settles the transfer), then serves the content and logs the transaction.
5. That transaction shows up on the publisher's dashboard in real time.

No proof, no payment, no content. The publisher never has to touch a wallet, crypto exchange, or
invoice — verification and settlement are handled by the facilitator on the publisher's behalf.

## Installing the WordPress plugin

The plugin is the fastest path to connecting a WordPress site — no reverse proxy or DNS changes
required to get started.

1. Sign in to the publisher dashboard (magic-link, no password) and add your site. Full setup
   instructions, including this step, are in [`packages/dashboard/README.md`](packages/dashboard/README.md).
2. On your site's **Setup** page in the dashboard, copy the **deploy key** shown there.
3. Download the plugin zip: build it yourself with `./packages/wp-plugin/build/build.sh` (produces
   `packages/wp-plugin/build/dist/crawlpay-<version>.zip`), or grab the latest release zip from
   this repo's Releases page once one is published.
4. In WordPress: **Plugins → Add New → Upload Plugin**, choose the zip, install, and activate.
5. Go to **Settings → CrawlPay**. Two modes are available:
   - **Mode B (default, works immediately)** — no server changes needed. WordPress itself checks
     each request's User-Agent and calls out to the middleware only when it looks like an AI
     crawler. Good for shared hosting where you can't run a reverse proxy.
   - **Mode A (recommended once you can)** — point your site's DNS/server config at a deployed
     CrawlPay middleware instance instead, and it handles every request directly. Stronger bot
     detection (Web Bot Auth signatures, not just User-Agent), but requires deploying and pointing
     traffic at a middleware instance first (see `packages/middleware/README.md` and the root
     `render.yaml` for a deployable config).
6. Paste your site's middleware URL and deploy key/site key into the Settings page, save, and set
   your pricing policy. Full detail on both modes is in
   [`packages/wp-plugin/README.md`](packages/wp-plugin/README.md).

The plugin is licensed GPL-2.0-or-later (see [`packages/wp-plugin/LICENSE`](packages/wp-plugin/LICENSE))
— required for WordPress.org distribution and consistent with WordPress core's own license.

## Layout

```
/packages/core         shared TypeScript types, x402 protocol schemas (zod), generic utils
/packages/middleware   Node/Fastify reverse-proxy middleware — Phase 1-4 work lands here
/packages/dashboard    Next.js 14 (App Router) publisher dashboard (Phase 6) — see its own README
/packages/wp-plugin    PHP WordPress plugin — Phase 5 work lands here (not part of the TS workspace)
/infra                 docker-compose.yml + Dockerfiles for local dev infra
```

`packages/core`, `packages/middleware`, and `packages/dashboard` are pnpm workspace packages
(`@crawlpay/core`, `@crawlpay/middleware`, `@crawlpay/dashboard`). `packages/wp-plugin` is plain
PHP and is excluded from the workspace, ESLint, and TypeScript config.

`infra/mock-origin` and `infra/mock-facilitator` are also pnpm workspace packages (small Express
apps) but live under `infra/` rather than `packages/` because they're test doubles, not product
code:

- **mock-origin** (port 4000) — a trivial static site standing in for a real WordPress origin, so
  the middleware has something to proxy in dev without needing a live WordPress install.
- **mock-facilitator** (port 4100) — a fake x402 facilitator. `POST /verify` accepts any
  well-formed `{ payload, paymentRequirements }` body and reports it valid; `GET /price-quote`
  returns a canned quote. Lets middleware/dashboard development proceed without hitting real
  Coinbase facilitator infra.

## Prerequisites

- Node.js >= 22 (pnpm 11 requires it)
- pnpm (`corepack enable` or `npm install -g pnpm`)
- Docker + Docker Compose (for local infra)

## Running locally

Start Redis, Postgres, and the two mock services:

```bash
docker compose -f infra/docker-compose.yml up
```

In another terminal, install dependencies and start the app packages (middleware + dashboard):

```bash
pnpm install
pnpm dev
```

- Middleware: http://localhost:8787 (`/health`)
- Dashboard: http://localhost:3000
- Mock origin: http://localhost:4000
- Mock facilitator: http://localhost:4100

## Scripts

Run from the repo root, fanned out across all workspace packages:

```bash
pnpm build       # tsc build / next build per package
pnpm lint        # eslint (root flat config; dashboard uses next lint)
pnpm typecheck   # tsc --noEmit per package
pnpm test        # vitest per package
pnpm format      # prettier --write .
```

## CI

`.github/workflows/ci.yml` runs install → lint → typecheck → test on every push and pull request.
