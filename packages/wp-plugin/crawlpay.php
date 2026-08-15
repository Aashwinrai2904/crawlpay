<?php
/**
 * Plugin Name: Crawlpay
 * Plugin URI: https://example.com/crawlpay
 * Description: Lets a WordPress site charge AI crawlers per request via x402. Phase 5 work — no functionality implemented yet.
 * Version: 0.0.1
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * Author: Crawlpay
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: crawlpay
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly.
}

define('CRAWLPAY_VERSION', '0.0.1');
define('CRAWLPAY_PLUGIN_FILE', __FILE__);

// Phase 5 work goes here: pairing with the middleware, exposing paywall
// settings in wp-admin, and reporting. Intentionally empty during scaffolding.
