# CrawlPay — WordPress plugin

PHP WordPress plugin (Phase 5). Not part of the pnpm/TypeScript workspace —
excluded from `pnpm-workspace.yaml`, root ESLint, and root TypeScript
config. The plugin itself has no PHP dependencies beyond WordPress core;
`composer.json` here is dev/test tooling only, never shipped.

**Manually verified on a real WordPress install** (TasteWP, WP 7.0.4, PHP 8,
2026-08-16): plugin activation, the Settings > CrawlPay page (loads and
saves), the per-post/page "CrawlPay Pricing" meta box, and the "CrawlPay
Activity" dashboard widget all confirmed working with no fatal errors. This
caught one real bug pre-launch: `crawlpay.php` originally called
`\CrawlPay\Plugin::instance()->init()` unconditionally at file-scope, which
WordPress's activation-time `plugin_sandbox_scrape()` re-include tripped
over as a fatal `TypeError`. Fixed by deferring that call to `plugins_loaded`
(see crawlpay.php).

**PHPUnit suite run for the first time, all green** (2026-08-27): 17
tests, 31 assertions, against a real MariaDB-backed WP 6.9.7 test
environment (`wp-phpunit/wp-phpunit`, matched to the version composer
actually resolves). `tests/test-rest-config-controller.php` and
`tests/test-mode-b-guard.php` both pass unmodified — see "Running the
tests" below for the exact setup, since it's a few non-obvious steps
(`WP_PHPUNIT__TESTS_CONFIG`, a matching WP core checkout).

**Mode B's `/verify-and-price` call verified end-to-end against a live
middleware** (2026-08-27), closing the other gap this section used to
flag: a real WordPress 6.9.7 site (MariaDB-backed, plugin activated via
`activate_plugin()`, Mode B configured with a middleware URL and site
key) was hit with a GPTBot User-Agent through the actual `template_redirect`
guard, against an actually-running middleware + mock facilitator — not a
stub. Unpaid request: real `402` with a live-generated x402 challenge from
the middleware. Same request retried with a payment proof built from that
challenge's nonce: WordPress served the real page (`200`), and the
middleware's transaction log recorded the payment. Confirms the plugin's
`wp_remote_post()` call, the middleware's site-key auth, and the
quote/proof split in `class-mode-b-guard.php` all work together as
designed, not just in isolation.

Run `phpcs` (WordPress-Coding-Standards) if you want static analysis on
top of the above — not yet run.

## What this plugin is

A thin bridge between WordPress and the CrawlPay Node middleware
([`../middleware`](../middleware)). It does not implement payment logic,
bot classification, or x402 handshake logic itself — the middleware owns
all of that. The plugin's job is configuration UI and, in Mode B only, a
lightweight fallback gate.

## Two modes

**Mode A — reverse proxy (recommended).** Point your DNS/server config at
the middleware in front of your existing WordPress install. The middleware
handles every request (classification, caching, the 402/payment flow); the
plugin only:
- exposes a Settings > CrawlPay admin page for policy/pricing config and a
  per-post/page price override meta box,
- exposes that config at `GET /wp-json/crawlpay/v1/config` for the
  middleware to poll (the middleware does not yet poll this — see below),
- shows a dashboard widget with recent activity, pulled from the
  middleware's `GET /stats`.

**Mode B — fallback for shared hosting.** For sites that can't reconfigure
a reverse proxy. WordPress classifies requests by User-Agent against a
bundled copy of the middleware's crawler signature list
(`data/bot-signatures.json` — see the known-limitations note in
`includes/class-bot-signatures.php`: this is a manually-synced snapshot,
and User-Agent matching alone can't verify Web Bot Auth signatures the way
the middleware can). On an `ai-crawler` match under a "charge" policy, it
calls the middleware's `POST /verify-and-price` synchronously
(`wp_remote_post`) before deciding whether to serve the page or return a
402. Price quotes (not proofs) are cached in a short-TTL WP transient to
avoid a network call on every request — see `class-mode-b-guard.php`'s
docblock for the reasoning, including why proof-bearing requests are never
cached and why the guard fails open if the middleware is unreachable.

Default mode on activation is Mode B (works immediately, no infra
changes) — switch to Mode A once your reverse proxy is actually in place.

## Not yet wired up

- Per-post price overrides are exposed via REST (`overrides` in the config
  response) but not yet consumed anywhere — not by the middleware's own
  pricing decisions, and not by Mode B's `/verify-and-price` calls (both
  only know the site-wide default price).

The middleware polling this plugin's `GET /wp-json/crawlpay/v1/config` for
policy/pricing (including `payTo`) — instead of only reading its local
`publisher-config.json` — is now wired up on the middleware side (see
[`../middleware/src/config/publisher-config-source.ts`](../middleware/src/config/publisher-config-source.ts)).
Point it at this site by setting the middleware's `CRAWLPAY_WORDPRESS_URL`
env var to this site's base URL; it reuses the same site key both plugin
and middleware already share. It polls every 30s and falls back to the
local file if this site is ever unreachable, so a WordPress outage
degrades to stale pricing rather than breaking the middleware.

See [`../../SECURITY-REVIEW-NOTES.md`](../../SECURITY-REVIEW-NOTES.md) for
known gaps flagged during this phase (items 5-8).

## Structure

```
crawlpay.php                              Plugin bootstrap, activation/deactivation hooks
uninstall.php                             Cleanup on delete (not deactivate)
includes/class-plugin.php                 Orchestrates every subsystem's hooks
includes/class-settings.php               Settings > CrawlPay admin page
includes/class-post-pricing.php           Per-post/page price override meta box
includes/class-rest-config-controller.php GET /wp-json/crawlpay/v1/config
includes/class-dashboard-widget.php       "CrawlPay Activity" dashboard widget
includes/class-bot-signatures.php         Mode B's bundled UA-matching
includes/class-mode-b-guard.php           Mode B's template_redirect gate
data/bot-signatures.json                  Manually-synced copy of the middleware's crawler list
build/build.sh                            Packages the plugin into an installable .zip
tests/                                    PHPUnit tests (wp-phpunit-based)
```

## Building the installable zip

```bash
./build/build.sh
```

Requires `zip` on `PATH` (standard on macOS/Linux; use WSL or install `zip`
in Git Bash on Windows). Produces
`build/dist/crawlpay-<version>.zip`, laid out so extracting it at the root
of `wp-content/plugins/` creates `wp-content/plugins/crawlpay/...`.

## Running the tests

Requires a real MySQL/MariaDB test database and a WordPress core checkout
matching whatever version `composer install` resolves `wp-phpunit/wp-phpunit`
to (check `composer.lock` — it won't necessarily match this plugin's
`Requires at least` header). The [WordPress core testing
handbook](https://make.wordpress.org/core/handbook/testing/automated-testing/phpunit/)
covers the general approach; concretely, what actually worked:

```bash
composer install   # pulls in wp-phpunit/wp-phpunit as a dev dependency

# WP core itself isn't part of that package -- fetch a matching version.
# Check composer.lock's wp-phpunit/wp-phpunit "version" first and use the
# same X.Y-branch here.
git clone --depth 1 --branch 6.9-branch \
  https://github.com/WordPress/WordPress.git /tmp/wp-core-test

# A MySQL/MariaDB user + database PHPUnit can freely create/drop tables in:
mysql -u root -e "
  CREATE DATABASE wordpress_test;
  CREATE USER 'wp_test'@'localhost' IDENTIFIED BY 'wp_test_pw';
  GRANT ALL PRIVILEGES ON wordpress_test.* TO 'wp_test'@'localhost';
"

cat > /tmp/wp-tests-config.php <<'EOF'
<?php
define( 'DB_NAME', 'wordpress_test' );
define( 'DB_USER', 'wp_test' );
define( 'DB_PASSWORD', 'wp_test_pw' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8' );
define( 'DB_COLLATE', '' );
$table_prefix = 'wptests_';
define( 'WP_TESTS_DOMAIN', 'example.org' );
define( 'WP_TESTS_EMAIL', 'admin@example.org' );
define( 'WP_TESTS_TITLE', 'CrawlPay Test Suite' );
define( 'WP_PHP_BINARY', 'php' );
define( 'ABSPATH', '/tmp/wp-core-test/' );
EOF

export WP_PHPUNIT__TESTS_CONFIG=/tmp/wp-tests-config.php
php vendor/wp-phpunit/wp-phpunit/includes/install.php /tmp/wp-tests-config.php
vendor/bin/phpunit
```

`tests/test-rest-config-controller.php` covers the REST config endpoint
(route registration, policy/pricing/override shape, site-key auth).
`tests/test-mode-b-guard.php` covers `Mode_B_Guard::decide()` — every
branch (mode gating, policy gating, admin/no-config short-circuits,
UA matching, quote caching, proof handling, fail-open behavior) — via
WordPress's `pre_http_request` filter to stub the middleware call, so no
live middleware is needed.
