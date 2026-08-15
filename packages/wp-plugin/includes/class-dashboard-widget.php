<?php
/**
 * "CrawlPay Activity" wp-admin dashboard widget.
 *
 * @package CrawlPay
 */

namespace CrawlPay;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Shows recent AI-crawler activity and revenue, fetched from the
 * middleware's GET /stats. Cached in a short-lived transient so the
 * dashboard (loaded on every wp-admin visit) doesn't hit the middleware
 * every time.
 */
class Dashboard_Widget {

	const CACHE_KEY = 'crawlpay_dashboard_stats';
	const CACHE_TTL = 30; // seconds

	/**
	 * @return void
	 */
	public function register() {
		add_action( 'wp_dashboard_setup', array( $this, 'add_widget' ) );
	}

	/**
	 * @return void
	 */
	public function add_widget() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		wp_add_dashboard_widget(
			'crawlpay_activity_widget',
			__( 'CrawlPay Activity', 'crawlpay' ),
			array( $this, 'render' )
		);
	}

	/**
	 * @return void
	 */
	public function render() {
		$settings = Settings::get_raw_settings();
		if ( '' === $settings['middleware_url'] ) {
			echo '<p>' . esc_html__( 'Set a middleware URL under Settings > CrawlPay to see activity here.', 'crawlpay' ) . '</p>';
			return;
		}

		$stats = $this->fetch_stats( $settings );
		if ( null === $stats ) {
			echo '<p>' . esc_html__( 'Could not reach the CrawlPay middleware.', 'crawlpay' ) . '</p>';
			return;
		}

		$cache   = is_array( $stats['cache'] ?? null ) ? $stats['cache'] : array();
		$revenue = is_array( $stats['revenue'] ?? null ) ? $stats['revenue'] : array();

		printf(
			'<p>%s</p>',
			esc_html(
				sprintf(
					/* translators: 1: cache hits, 2: cache misses (origin fetches) */
					__( 'Cache: %1$d hits / %2$d origin fetches since the middleware last restarted.', 'crawlpay' ),
					(int) ( $cache['hits'] ?? 0 ),
					(int) ( $cache['misses'] ?? 0 )
				)
			)
		);

		if ( empty( $revenue ) ) {
			echo '<p>' . esc_html__( 'No paid AI-crawler requests recorded yet.', 'crawlpay' ) . '</p>';
			return;
		}

		echo '<table class="widefat striped">';
		echo '<thead><tr>';
		echo '<th>' . esc_html__( 'Classification', 'crawlpay' ) . '</th>';
		echo '<th>' . esc_html__( 'Requests', 'crawlpay' ) . '</th>';
		echo '<th>' . esc_html__( 'Total (atomic units)', 'crawlpay' ) . '</th>';
		echo '</tr></thead><tbody>';
		foreach ( $revenue as $row ) {
			echo '<tr>';
			echo '<td>' . esc_html( (string) ( $row['classification'] ?? '' ) ) . '</td>';
			echo '<td>' . esc_html( (string) ( $row['count'] ?? 0 ) ) . '</td>';
			echo '<td>' . esc_html( (string) ( $row['totalAmount'] ?? '0' ) ) . '</td>';
			echo '</tr>';
		}
		echo '</tbody></table>';
	}

	/**
	 * @param array $settings Raw plugin settings.
	 * @return array|null
	 */
	private function fetch_stats( $settings ) {
		$cached = get_transient( self::CACHE_KEY );
		if ( false !== $cached ) {
			return $cached;
		}

		$url  = trailingslashit( $settings['middleware_url'] ) . 'stats';
		$args = array( 'timeout' => 5 );
		if ( '' !== $settings['site_key'] ) {
			$args['headers'] = array( 'X-Crawlpay-Site-Key' => $settings['site_key'] );
		}

		$response = wp_remote_get( $url, $args );
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}

		$decoded = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $decoded ) ) {
			return null;
		}

		set_transient( self::CACHE_KEY, $decoded, self::CACHE_TTL );
		return $decoded;
	}
}
