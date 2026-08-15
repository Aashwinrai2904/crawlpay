<?php
/**
 * Mode B: PHP-side payment gate via template_redirect.
 *
 * @package CrawlPay
 */

namespace CrawlPay;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Fallback for shared hosting where the site owner can't put a reverse
 * proxy in front of WordPress. Classifies by User-Agent only (see
 * Bot_Signatures for the documented limitations of that) and, on an
 * ai-crawler match under a "charge" policy, calls the middleware's
 * synchronous /verify-and-price endpoint before deciding whether to let
 * WordPress render the page or return a 402.
 *
 * Design choices worth knowing about:
 *  - A price quote (no proof presented yet) is cached in a WP transient for
 *    a short TTL, so a crawler re-requesting the same uncached page doesn't
 *    cost a network call to the middleware every single time. A quote
 *    reuses the same nonce for the whole TTL window — that's a deliberate,
 *    lighter-weight trade-off than Mode A/the middleware's own "always a
 *    fresh nonce" behavior, acceptable because the nonce is still only
 *    ever *spent* once, on whichever follow-up request actually presents a
 *    proof.
 *  - A presented payment proof is never cached and always checked live:
 *    nonces are single-use, so caching a verification verdict would let a
 *    replay slip through.
 *  - If the middleware is unreachable, this fails OPEN (serves the page
 *    normally) rather than blocking traffic — see SECURITY-REVIEW-NOTES.md
 *    for the revenue-leakage-vs-availability trade-off that decision
 *    represents.
 *
 * decide() is deliberately a pure function of its arguments (aside from the
 * network call and transient cache) with no exit()/header() side effects —
 * maybe_intercept() is the thin, untested-in-isolation wrapper that reads
 * superglobals and acts on decide()'s answer. Splitting it this way means
 * tests can exercise every branch of the actual decision logic without
 * PHPUnit having to survive a real exit() call.
 */
class Mode_B_Guard {

	const QUOTE_CACHE_PREFIX = 'crawlpay_quote_';
	const QUOTE_CACHE_TTL    = MINUTE_IN_SECONDS;

	/**
	 * @return void
	 */
	public function register() {
		add_action( 'template_redirect', array( $this, 'maybe_intercept' ) );
	}

	/**
	 * @return void
	 */
	public function maybe_intercept() {
		$settings       = Settings::get_raw_settings();
		$user_agent     = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
		$payment_header = isset( $_SERVER['HTTP_X_PAYMENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_PAYMENT'] ) ) : '';
		$url            = $this->current_url();

		$decision = $this->decide( $settings, $user_agent, $url, $payment_header, is_admin() );

		if ( 'block' === $decision['action'] ) {
			$this->send_payment_required( $decision['payload'] );
		}
		// 'pass': do nothing and let WordPress render the page normally.
	}

	/**
	 * @param array  $settings       Raw plugin settings (Settings::get_raw_settings()).
	 * @param string $user_agent     Raw User-Agent header value.
	 * @param string $url            Current request URL.
	 * @param string $payment_header Raw X-Payment header value, or '' if none was sent.
	 * @param bool   $is_admin       Whether this is a wp-admin request.
	 * @return array{action: string, payload: array|null} action is "pass" or "block".
	 */
	public function decide( $settings, $user_agent, $url, $payment_header, $is_admin ) {
		if ( 'mode_b' !== $settings['mode'] ) {
			return $this->pass(); // Mode A: the reverse proxy handles everything; this plugin touches nothing.
		}
		if ( 'charge' !== ( $settings['policy']['ai-crawler'] ?? 'allow' ) ) {
			return $this->pass(); // ai-crawler isn't set to "charge" -- nothing for Mode B to enforce.
		}
		if ( $is_admin ) {
			return $this->pass();
		}
		if ( '' === $settings['middleware_url'] ) {
			return $this->pass(); // Not configured yet; do nothing rather than break the site.
		}
		if ( ! Bot_Signatures::is_ai_crawler( $user_agent ) ) {
			return $this->pass();
		}

		if ( '' !== $payment_header ) {
			return $this->decide_with_proof( $settings, $url, $payment_header );
		}

		return $this->decide_without_proof( $settings, $url );
	}

	/**
	 * A specific payment proof is single-use — always checked live, never
	 * served from cache.
	 *
	 * @param array  $settings       Raw plugin settings.
	 * @param string $url            Current request URL.
	 * @param string $payment_header Raw X-Payment header value.
	 * @return array{action: string, payload: array|null}
	 */
	private function decide_with_proof( $settings, $url, $payment_header ) {
		$result = $this->call_verify_and_price( $settings, $url, $payment_header );

		if ( null === $result ) {
			return $this->pass(); // middleware unreachable: fail open
		}
		if ( 'allow' === ( $result['action'] ?? '' ) ) {
			return $this->pass();
		}

		return $this->block( $result['paymentRequired'] ?? null );
	}

	/**
	 * No proof presented: the price quote for a given URL doesn't change
	 * request to request, so it's safe to cache briefly and skip the
	 * network call on repeat hits.
	 *
	 * @param array  $settings Raw plugin settings.
	 * @param string $url      Current request URL.
	 * @return array{action: string, payload: array|null}
	 */
	private function decide_without_proof( $settings, $url ) {
		$cache_key = self::QUOTE_CACHE_PREFIX . md5( $url );
		$quote     = get_transient( $cache_key );

		if ( false === $quote ) {
			$result = $this->call_verify_and_price( $settings, $url, '' );
			if ( null === $result ) {
				return $this->pass(); // middleware unreachable: fail open, don't cache a failure
			}
			$quote = $result['paymentRequired'] ?? null;
			set_transient( $cache_key, $quote, self::QUOTE_CACHE_TTL );
		}

		return $this->block( $quote );
	}

	/**
	 * @return array{action: string, payload: null}
	 */
	private function pass() {
		return array(
			'action'  => 'pass',
			'payload' => null,
		);
	}

	/**
	 * @param array|null $payload Payment-required manifest to send.
	 * @return array{action: string, payload: array|null}
	 */
	private function block( $payload ) {
		return array(
			'action'  => 'block',
			'payload' => $payload,
		);
	}

	/**
	 * @param array  $settings       Raw plugin settings.
	 * @param string $url            Current request URL.
	 * @param string $payment_header Raw X-Payment header value, or '' if none.
	 * @return array|null Decoded response, or null on any failure to reach the middleware.
	 */
	private function call_verify_and_price( $settings, $url, $payment_header ) {
		$endpoint = trailingslashit( $settings['middleware_url'] ) . 'verify-and-price';

		$body = array( 'url' => $url );
		if ( '' !== $payment_header ) {
			$body['paymentProofHeader'] = $payment_header;
		}

		$args = array(
			'timeout' => 5,
			'headers' => array( 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode( $body ),
		);
		if ( '' !== $settings['site_key'] ) {
			$args['headers']['X-Crawlpay-Site-Key'] = $settings['site_key'];
		}

		$response = wp_remote_post( $endpoint, $args );
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}

		$decoded = json_decode( wp_remote_retrieve_body( $response ), true );
		return is_array( $decoded ) ? $decoded : null;
	}

	/**
	 * @param array|null $payload The middleware's paymentRequired body, if any.
	 * @return void
	 */
	private function send_payment_required( $payload ) {
		status_header( 402 );
		nocache_headers();
		header( 'Content-Type: application/json' );

		if ( ! is_array( $payload ) ) {
			$payload = array(
				'x402Version' => 1,
				'error'       => 'Payment required for this resource.',
				'accepts'     => array(),
			);
		}

		echo wp_json_encode( $payload );
		exit;
	}

	/**
	 * @return string
	 */
	private function current_url() {
		$scheme = is_ssl() ? 'https' : 'http';
		$host   = isset( $_SERVER['HTTP_HOST'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ) ) : '';
		$uri    = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '/';
		return $scheme . '://' . $host . $uri;
	}
}
