# crawlpay

Lets publishers charge AI crawlers per request over the [x402](https://www.x402.org/) protocol.
Phases 0-6 are implemented: bot detection + caching + payment middleware (Phase 1-4), a WordPress
plugin (Phase 5), and a Next.js publisher dashboard (Phase 6) backed by Postgres/Prisma. Dynamic
pricing (Phase 7) and a security review (Phase 8) are still ahead.

## Layout

```
/packages/core         shared TypeScript types, x402 protocol schemas (zod), generic utils
/packages/middleware   Node/Fastify reverse-proxy middleware — Phase 1-4
/packages/dashboard    Next.js 14 (App Router) publisher dashboard — Phase 6, Prisma/Postgres-backed
/packages/wp-plugin    PHP WordPress plugin — Phase 5 (not part of the TS workspace)
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

In another terminal, install dependencies, apply the dashboard's Prisma schema, and start the app
packages (middleware + dashboard):

```bash
pnpm install
pnpm --filter @crawlpay/dashboard db:migrate
pnpm dev
```

- Middleware: http://localhost:8787 (`/health`)
- Dashboard: http://localhost:3000
- Mock origin: http://localhost:4000
- Mock facilitator: http://localhost:4100

## Dashboard (Phase 6)

`packages/dashboard` is the publisher-facing SaaS surface: email magic-link sign-in (NextAuth),
Postgres via Prisma (`packages/dashboard/prisma/schema.prisma`), pages to view revenue/traffic and
manage pricing/policy per site, and a small internal API
(`app/api/internal/sites/[siteId]/{config,transactions}`) the middleware calls instead of reading
`publisher-config.json` or only `console.log`-ing transactions.

Copy `packages/dashboard/.env.example` to `.env` and fill in an SMTP server (for magic-link
emails) and `NEXTAUTH_SECRET` (`openssl rand -base64 32`) before running it locally. The internal
API is authenticated by a per-site deploy key (shown on a site's Setup page), not by NextAuth —
see that page for the middleware env vars (`CRAWLPAY_DASHBOARD_URL`, `CRAWLPAY_SITE_ID`,
`CRAWLPAY_DEPLOY_KEY`) that connect the two. If the dashboard is unreachable, the middleware keeps
serving the last config it fetched, then falls back to the local JSON file — a dashboard outage
never takes a site down.

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
