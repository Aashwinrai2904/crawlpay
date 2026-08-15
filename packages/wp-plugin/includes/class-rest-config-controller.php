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
 * Note: as of this version the middleware itself still reads
 * publisher-config.json locally and does not yet poll this endpoint —
 * that wiring is future work on the middleware side.
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
			// No key configured: open. Fine for local development; the
			// settings page and README both call out that production
			// deployments should set one.
			return true;
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
