<?php
/**
 * Plugin Name: CrawlPay Mode A test shims
 * Description: Test-only. Loaded as a must-use plugin by
 *   infra/docker-compose.test-mode-a.yml. Not part of the CrawlPay product.
 *
 * The CrawlPay middleware reverse-proxies to this WordPress over the internal
 * Docker network as http://wordpress/, i.e. it forwards neither the original
 * Host header nor most request headers. Without this shim WordPress issues a
 * canonical 301 to WP_HOME (http://localhost:8787/) for the front page,
 * because the request it actually receives arrives with Host: wordpress.
 * Disable the canonical redirect so the proxied homepage renders 200.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_filter( 'redirect_canonical', '__return_false' );
