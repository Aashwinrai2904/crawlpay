# CrawlPay — Publisher Dashboard

Next.js 14 (App Router) SaaS dashboard (Phase 6). Publishers sign in with a
Supabase Auth magic link, manage pricing/policy per site, and see revenue —
replacing the middleware's local `publisher-config.json` for any site that
opts into it, without requiring the WordPress plugin at all.

## Auth: Supabase Auth, not NextAuth

The build plan's Phase 6 spec called for NextAuth + a separate email
provider (Resend); this was deliberately swapped for Supabase Auth's
built-in email magic-link at the user's explicit request ("keep everything
in one place") — same DB, same auth, one less vendor. See
`lib/supabase/*` and `middleware.ts`.

## Data model

Postgres tables (`publishers`, `sites`, `pricing_rules`, `policy_rules`,
`transactions`) were created directly in Supabase via the Supabase MCP
tools, not through `prisma migrate` — `prisma/schema.prisma` mirrors them
by hand (see its header comment). `publishers.id` is a foreign key to
Supabase's own `auth.users(id)`; a database trigger
(`on_auth_user_created`) provisions a `publishers` row automatically on
first magic-link sign-in.

Every table has RLS enabled with **no policies** — a deny-all backstop for
PostgREST/`supabase-js` (the `anon`/`authenticated` roles can authenticate
but can't read or write any app table directly). All real access goes
through Prisma using a dedicated `crawlpay_app` Postgres role with
`BYPASSRLS`, over a direct connection string that's never shipped to the
browser. **This means tenant isolation is enforced in application code**
(`requirePublisher()` / `requireOwnedSite()` in `lib/auth.ts` and
`app/dashboard/sites/[id]/actions.ts`), not by the database — a leaked
`DATABASE_URL` is a full read/write credential across every publisher's
data, not just one tenant's. Logged in `../../SECURITY-REVIEW-NOTES.md`.

## Internal API for the middleware

`app/api/v1/config` (GET) and `app/api/v1/transactions` (POST) are called
by the deployed middleware, not browsers — authenticated by a per-site
`middlewareDeployKey` bearer token (`Authorization: Bearer <key>`), shown
on a site's Setup page. This is the dashboard-managed sibling of the WP
plugin's `WordPressPublisherConfigSource` — see
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
cp .env.example .env   # fill in DATABASE_URL / NEXT_PUBLIC_SUPABASE_* — see that file
pnpm install
pnpm --filter @crawlpay/dashboard dev
```

## Tests

`pnpm --filter @crawlpay/dashboard test` runs real integration tests
against the live Supabase Postgres in `.env` (not mocks) — consistent with
how the rest of this repo tests against real ephemeral services rather
than stubbing them. The `GET /api/v1/config` → 200 and
`POST /api/v1/transactions` → 201 authorized paths were verified manually
against a throwaway fixture site (created and deleted via the Supabase MCP
tools) rather than committed as an automated test, since exercising them
requires a real `auth.users` row — see the file history for that session
if you need to redo it. What *is* automated: `buildConfigResponse`'s pure
derivation logic (all branches) and both routes' unauthorized-request
paths (401 without/with a bad deploy key).
