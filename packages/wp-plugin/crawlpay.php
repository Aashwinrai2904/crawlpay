<?php
/**
 * Plugin Name: CrawlPay
 * Plugin URI: https://example.com/crawlpay
 * Description: Lets AI crawlers pay per request for your content via x402. Thin bridge to the CrawlPay Node middleware — this plugin does not implement payment logic itself.
 * Version: 0.1.0
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * Author: Crawlpay
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: crawlpay
 *
 * @package CrawlPay
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

define( 'CRAWLPAY_VERSION', '0.1.0' );
define( 'CRAWLPAY_PLUGIN_FILE', __FILE__ );
define( 'CRAWLPAY_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'CRAWLPAY_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'CRAWLPAY_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

require_once CRAWLPAY_PLUGIN_DIR . 'includes/class-settings.php';
require_once CRAWLPAY_PLUGIN_DIR . 'includes/class-post-pricing.php';
require_once CRAWLPAY_PLUGIN_DIR . 'includes/class-rest-config-controller.php';
require_once CRAWLPAY_PLUGIN_DIR . 'includes/class-dashboard-widget.php';
require_once CRAWLPAY_PLUGIN_DIR . 'includes/class-bot-signatures.php';
require_once CRAWLPAY_PLUGIN_DIR . 'includes/class-mode-b-guard.php';
require_once CRAWLPAY_PLUGIN_DIR . 'includes/class-plugin.php';

register_activation_hook( CRAWLPAY_PLUGIN_FILE, array( '\CrawlPay\Plugin', 'activate' ) );
register_deactivation_hook( CRAWLPAY_PLUGIN_FILE, array( '\CrawlPay\Plugin', 'deactivate' ) );

\CrawlPay\Plugin::instance()->init();
