# CrawlPay — Publisher Dashboard

Next.js 14 (App Router) SaaS dashboard (Phase 6). Publishers sign in with a
NextAuth email magic link, manage pricing/policy per site, and see revenue —
replacing the middleware's local `publisher-config.json` for any site that
opts into it, without requiring the WordPress plugin at all.

## Stack

- **Auth:** NextAuth (`next-auth` v4) with the Email provider (magic link),
  persisted via `@next-auth/prisma-adapter`. Sessions are JWT-based (not
  database sessions) so `middleware.ts` can check them at the edge without a
  DB round trip per request. Magic-link email is sent through Resend's HTTP
  API directly (`lib/auth-options.ts`'s `sendVerificationRequest`) — no
  `resend` SDK dependency, just `fetch`.
- **Database:** any Postgres, via Prisma. Real migrations are committed in
  `prisma/migrations/` — `prisma migrate deploy` stands up the schema from
  scratch on a fresh database (Neon, Railway, a local Postgres, whatever).
  This project previously ran on Supabase (both for Postgres hosting and
  Supabase Auth); it was moved off after Supabase's free-tier
  active-project cap made the project unreachable, and Supabase Auth can't
  run against a non-Supabase Postgres. If you land back on Supabase, its
  Postgres works fine as a plain `DATABASE_URL` target — you'd just be
  skipping its Auth/PostgREST features entirely, same as any other
  provider.

## Data model

`publishers`, `sites`, `pricing_rules`, `policy_rules`, `transactions`, plus
NextAuth's own `users`/`accounts`/`sessions`/`verification_tokens` tables
(see `prisma/schema.prisma`). `Publisher.userId` is a 1:1 FK to NextAuth's
`User` — there's no database trigger provisioning it; `requirePublisher()`
in `lib/auth.ts` upserts it on first dashboard visit after sign-in.

There's no RLS here (unlike the earlier Supabase-backed version) — there's
no PostgREST/direct-client-to-Postgres path in this architecture, every
access goes through Prisma from server-side Next.js code. **Tenant
isolation is enforced in application code** (`requirePublisher()` /
`requireOwnedSite()` in `lib/auth.ts` and
`app/dashboard/sites/[id]/actions.ts`), not by the database — treat
`DATABASE_URL` as a full read/write credential across every publisher's
data, not just one tenant's. Logged in `../../SECURITY-REVIEW-NOTES.md`.

## Internal API for the middleware

`app/api/v1/config` (GET) and `app/api/v1/transactions` (POST) are called
by the deployed middleware, not browsers — authenticated by a per-site
`middlewareDeployKey` bearer token (`Authorization: Bearer <key>`, generated
in application code at site-creation time — see `app/dashboard/actions.ts`),
shown on a site's Setup page. This is the dashboard-managed sibling of the
WP plugin's `WordPressPublisherConfigSource` — see
`packages/middleware/src/config/dashboard-publisher-config-source.ts` and
`.../transactions/dashboard-transaction-log.ts`. Set
`CRAWLPAY_DASHBOARD_URL` / `CRAWLPAY_DASHBOARD_DEPLOY_KEY` on the
middleware to point it at a site here; it takes priority over
`CRAWLPAY_WORDPRESS_URL` if both are set (a site is expected to be managed
by one or the other, not both).

Pricing note: `pricing_rules.price_cents` is USD-cents; the config API
converts to USDC's 6-decimal atomic units at a 1:1 USD peg
(`price_cents * 10_000`). Only a site-wide `ai-crawler` rule (path pattern
`*`) is consumed today — per-path and non-`ai-crawler` pricing rows exist
in the schema for future use but nothing reads them yet, the same
"not yet consumed" gap the WP plugin's per-post overrides already have.

## Local setup

```bash
cp .env.example .env   # fill in DATABASE_URL / NEXTAUTH_* / RESEND_API_KEY -- see that file
pnpm install
pnpm --filter @crawlpay/dashboard exec prisma migrate deploy   # or `migrate dev` if iterating on the schema
pnpm --filter @crawlpay/dashboard dev
```

`NEXTAUTH_SECRET` needs a real random value even locally (NextAuth refuses
to sign JWTs without one): `openssl rand -base64 32`.

Without a `RESEND_API_KEY`, magic-link sign-in will fail at the "send
email" step (everything up to and including generating/persisting the
verification token still works) — sign-in requires a real key.

## Deploying (Vercel)

The dashboard's `package.json` has a `vercel-build` script
(`pnpm --filter @crawlpay/core build && next build`) that Vercel picks up
automatically instead of `build` — needed because `@crawlpay/core` ships a
compiled `dist/` (see its own `package.json`), and Vercel's build for this
project only runs commands inside `packages/dashboard`, never the monorepo
root's `pnpm -r build` that would otherwise build `core` first.

Required env vars on Vercel: `DATABASE_URL` (a pooled connection string if
your provider offers one — direct connections exhaust fast on serverless),
`NEXTAUTH_URL` (the deployed URL), `NEXTAUTH_SECRET`, `RESEND_API_KEY`,
`EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`. Run `prisma migrate deploy` against
the production `DATABASE_URL` before or as part of first deploy — nothing
runs migrations automatically.

## Tests

`pnpm --filter @crawlpay/dashboard test` runs real integration tests
against whatever `DATABASE_URL` is in `.env` (not mocks) — consistent with
how the rest of this repo tests against real ephemeral services rather
than stubbing them. Covers `buildConfigResponse`'s pure derivation logic
(all branches) and both `/api/v1/*` routes' unauthorized-request paths (401
without/with a bad deploy key).
