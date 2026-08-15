<?php
/**
 * Uninstall routine.
 *
 * WordPress core loads this file directly (not through the plugin's main
 * file) when the plugin is deleted from the Plugins screen — never on plain
 * deactivation. Removes every option and post meta this plugin created.
 *
 * @package CrawlPay
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'crawlpay_settings' );

global $wpdb;

// Per-post/page pricing overrides, stored as post meta.
$wpdb->delete( $wpdb->postmeta, array( 'meta_key' => '_crawlpay_price_override' ) ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one-time uninstall cleanup, not a request-time query.

// Mode B's short-TTL price-quote transients (crawlpay_quote_<md5(url)>).
$like_value   = $wpdb->esc_like( '_transient_crawlpay_quote_' ) . '%';
$like_timeout = $wpdb->esc_like( '_transient_timeout_crawlpay_quote_' ) . '%';
$wpdb->query(
	$wpdb->prepare(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
		$like_value,
		$like_timeout
	)
); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- uninstall-time transient sweep, no wp_options API for a LIKE-pattern bulk delete.
