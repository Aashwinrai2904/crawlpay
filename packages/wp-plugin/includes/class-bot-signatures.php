<?php
/**
 * Bundled bot-signatures.json loader for Mode B.
 *
 * @package CrawlPay
 */

namespace CrawlPay;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * KNOWN LIMITATION: data/bot-signatures.json is a manually-copied snapshot
 * of packages/middleware/config/bot-signatures.json (Phase 2). There is no
 * automated sync between the two — if the Node list gains or renames a
 * crawler entry, this file drifts out of date until someone updates it by
 * hand. This also means Mode B can only ever match on a plain,
 * case-insensitive User-Agent substring; it has no way to verify Web Bot
 * Auth (RFC 9421) cryptographic signatures the way the middleware's
 * verifyBotAuthSignature() does — that's not feasible to reimplement in
 * PHP for this phase, so Mode B is inherently spoofable by anyone who sets
 * a matching User-Agent string. This is an accepted, documented trade-off
 * for shared-hosting sites that can't run Mode A's reverse proxy.
 */
class Bot_Signatures {

	/**
	 * @var array|null
	 */
	private static $config = null;

	/**
	 * @return array
	 */
	private static function load() {
		if ( null !== self::$config ) {
			return self::$config;
		}

		$path = CRAWLPAY_PLUGIN_DIR . 'data/bot-signatures.json';
		$json = file_exists( $path ) ? file_get_contents( $path ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local bundled plugin asset, not a remote/user-supplied path.

		$decoded = json_decode( (string) $json, true );
		if ( ! is_array( $decoded ) ) {
			$decoded = array();
		}

		self::$config = array(
			'aiCrawlers'     => is_array( $decoded['aiCrawlers'] ?? null ) ? $decoded['aiCrawlers'] : array(),
			'searchCrawlers' => is_array( $decoded['searchCrawlers'] ?? null ) ? $decoded['searchCrawlers'] : array(),
		);

		return self::$config;
	}

	/**
	 * @param string $user_agent Raw User-Agent header value.
	 * @return bool
	 */
	public static function is_ai_crawler( $user_agent ) {
		if ( '' === trim( $user_agent ) ) {
			return false;
		}
		return self::matches_any( $user_agent, self::load()['aiCrawlers'] );
	}

	/**
	 * @param string $user_agent Raw User-Agent header value.
	 * @param array  $entries    List of { name, userAgentPattern } entries.
	 * @return bool
	 */
	private static function matches_any( $user_agent, $entries ) {
		foreach ( $entries as $entry ) {
			$pattern = isset( $entry['userAgentPattern'] ) ? (string) $entry['userAgentPattern'] : '';
			if ( '' !== $pattern && false !== stripos( $user_agent, $pattern ) ) {
				return true;
			}
		}
		return false;
	}
}
