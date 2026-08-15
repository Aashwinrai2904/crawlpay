<?php
/**
 * Core plugin orchestrator.
 *
 * @package CrawlPay
 */

namespace CrawlPay;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Wires up every subsystem's hooks on init. Kept as a thin orchestrator —
 * the actual logic for each concern lives in its own class.
 */
class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * @var Settings
	 */
	private $settings;

	/**
	 * @var Post_Pricing
	 */
	private $post_pricing;

	/**
	 * @var Rest_Config_Controller
	 */
	private $rest_config;

	/**
	 * @var Dashboard_Widget
	 */
	private $dashboard_widget;

	/**
	 * @var Mode_B_Guard
	 */
	private $mode_b_guard;

	/**
	 * @return Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Private constructor — use instance().
	 */
	private function __construct() {
		$this->settings         = new Settings();
		$this->post_pricing     = new Post_Pricing();
		$this->rest_config      = new Rest_Config_Controller();
		$this->dashboard_widget = new Dashboard_Widget();
		$this->mode_b_guard     = new Mode_B_Guard();
	}

	/**
	 * Registers every subsystem's WordPress hooks. Safe to call multiple
	 * times (WordPress only calls it once per request via the bootstrap
	 * file), but each register() call itself is idempotent-hook-safe.
	 *
	 * @return void
	 */
	public function init() {
		$this->settings->register();
		$this->post_pricing->register();
		add_action( 'rest_api_init', array( $this->rest_config, 'register_routes' ) );
		$this->dashboard_widget->register();
		$this->mode_b_guard->register();
	}

	/**
	 * Activation hook: seed default settings (without clobbering existing
	 * ones on a reactivate) and make sure /wp-json/crawlpay/v1/config is
	 * reachable immediately without the site owner needing to resave
	 * permalinks.
	 *
	 * @return void
	 */
	public static function activate() {
		if ( null === get_option( 'crawlpay_settings', null ) ) {
			add_option( 'crawlpay_settings', Settings::default_settings() );
		}
		flush_rewrite_rules();
	}

	/**
	 * Deactivation hook. Deliberately non-destructive — settings and price
	 * overrides survive a deactivate/reactivate cycle. Full cleanup only
	 * happens on uninstall (see uninstall.php).
	 *
	 * @return void
	 */
	public static function deactivate() {
		flush_rewrite_rules();
	}
}
