# Contributing to CrawlPay

Thanks for taking a look. This is a young, actively-developed project — expect some rough edges,
and please file an issue if you hit one that isn't already documented.

## Getting set up

Follow the root [README.md](README.md)'s "Running locally" section. If you hit something that
doesn't match what's written there, that's a documentation bug — please open an issue (or a PR
fixing it directly, which is even more useful).

## Project layout

See the root README's "Layout" section for what lives where. In short:

- `packages/core`, `packages/middleware`, `packages/dashboard` — TypeScript, pnpm workspace
- `packages/wp-plugin` — PHP, not part of the pnpm workspace, its own license (GPL-2.0-or-later)
- `infra/mock-origin`, `infra/mock-facilitator` — test doubles used in local dev and CI

## Before opening a PR

Run the same checks CI runs:

```bash
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

For `packages/wp-plugin` specifically, see its own
[README](packages/wp-plugin/README.md#running-the-tests) for how to set up a local WordPress
PHPUnit environment — it's a few non-obvious steps (matching the WP core checkout version to
whatever `composer.lock` resolves, `WP_PHPUNIT__TESTS_CONFIG`), all spelled out there.

## Making changes

- **Prefer real infra over mocks in tests** where practical — this repo tests against a real
  Postgres/Redis/WordPress instance rather than mocking them wherever feasible (see the test setup
  in each package's README). `infra/mock-origin` and `infra/mock-facilitator` exist specifically so
  the rest of the stack can be exercised for real without needing live WordPress or Coinbase
  facilitator infra.
- **Keep changes scoped.** A bug fix doesn't need an accompanying refactor; a new feature doesn't
  need speculative configurability nobody asked for.
- **Security-sensitive changes** (anything touching payment verification, bot classification, or
  cross-tenant data access in the dashboard) will get closer review — see
  [SECURITY-REVIEW-NOTES.md](SECURITY-REVIEW-NOTES.md) for the project's own running list of known
  gaps in exactly those areas, so you're not rediscovering something already tracked.

## Reporting a security issue

See [SECURITY.md](SECURITY.md) — please don't open a public issue for a genuine vulnerability.

## Code of conduct

Be respectful, assume good faith, keep discussion focused on the technical problem. Standard
open-source etiquette — there's no separate CODE_OF_CONDUCT.md yet; if this project grows a
community large enough to need one, that's a good problem to have and a good first PR for someone.
