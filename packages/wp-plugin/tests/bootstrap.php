<?php
/**
 * PHPUnit bootstrap.
 *
 * Requires a configured WordPress test environment: WP_TESTS_DIR pointing
 * at wp-phpunit's includes (installed via `composer install`, which pulls
 * in wp-phpunit/wp-phpunit as a dev dependency) and a reachable MySQL test
 * database, set up the same way as WordPress core's own test suite —
 * https://make.wordpress.org/core/handbook/testing/automated-testing/phpunit/
 *
 * Not runnable in this monorepo's Node-centric CI as-is; see this
 * package's README for how to set up a local WP test environment.
 *
 * @package CrawlPay
 */

$_tests_dir = getenv( 'WP_TESTS_DIR' );
if ( ! $_tests_dir ) {
	$_tests_dir = dirname( __DIR__ ) . '/vendor/wp-phpunit/wp-phpunit';
}

require_once $_tests_dir . '/includes/functions.php';

/**
 * Loads the plugin under test the same way WordPress would.
 *
 * @return void
 */
function _crawlpay_manually_load_plugin() {
	require dirname( __DIR__ ) . '/crawlpay.php';
}
tests_add_filter( 'muplugins_loaded', '_crawlpay_manually_load_plugin' );

require $_tests_dir . '/includes/bootstrap.php';
