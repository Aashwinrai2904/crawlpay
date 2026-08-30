<?php
/**
 * REST route exposing publisher config for the middleware to poll.
 *
 * @package CrawlPay
 */

namespace CrawlPay;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * GET /wp-json/crawlpay/v1/config — lets the middleware (Mode A) pull
 * policy/pricing/per-post overrides out of WordPress, so the site owner
 * manages everything from wp-admin while the middleware does the actual
 * request handling. Response shape matches the middleware's own
 * PublisherConfig (policy + pricing), plus an "overrides" array.
 *
 * The middleware polls this endpoint directly for WordPress-managed sites
 * (see WordPressPublisherConfigSource on the middleware side) when
 * CRAWLPAY_WORDPRESS_URL is set, falling back to its local
 * publisher-config.json only if this site is unreachable.
 */
class Rest_Config_Controller {

	const NAMESPACE_NAME = 'crawlpay/v1';
	const ROUTE           = '/config';

	/**
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			self::NAMESPACE_NAME,
			self::ROUTE,
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_config' ),
				'permission_callback' => array( $this, 'check_permission' ),
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Incoming request.
	 * @return bool
	 */
	public function check_permission( $request ) {
		$configured_key = Settings::get_raw_settings()['site_key'];
		if ( '' === $configured_key ) {
			// No key configured means no way to tell a legitimate caller
			// (the middleware) from anyone else -- refuse rather than
			// serve pricing/policy/payout-address config to the internet.
			// (Previously returned true here; see
			// SECURITY-REVIEW-NOTES.md item 8. Set Settings > CrawlPay >
			// Site key to use Mode A / the REST config endpoint at all.)
			return false;
		}
		$provided = $request->get_header( 'x_crawlpay_site_key' );
		return is_string( $provided ) && hash_equals( $configured_key, $provided );
	}

	/**
	 * @return \WP_REST_Response
	 */
	public function get_config() {
		$publisher_config = Settings::get_publisher_config();

		return new \WP_REST_Response(
			array(
				'policy'    => $publisher_config['policy'],
				'pricing'   => $publisher_config['pricing'],
				'overrides' => Post_Pricing::get_all_overrides(),
			),
			200
		);
	}
}
