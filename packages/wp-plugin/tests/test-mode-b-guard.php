<?php
/**
 * Tests for Mode B's template_redirect decision logic.
 *
 * @package CrawlPay
 */

/**
 * Exercises Mode_B_Guard::decide() directly (see that class's docblock for
 * why decide() is split out from the exit()-calling maybe_intercept()).
 * The middleware HTTP call is mocked via WordPress's own pre_http_request
 * filter — the standard way to stub wp_remote_post()/wp_remote_get() in a
 * WP test suite, no separate HTTP client abstraction needed.
 *
 * @covers \CrawlPay\Mode_B_Guard
 */
class Test_Mode_B_Guard extends WP_UnitTestCase {

	/**
	 * @var \CrawlPay\Mode_B_Guard
	 */
	private $guard;

	/**
	 * @var int
	 */
	private $http_call_count = 0;

	public function set_up() {
		parent::set_up();
		$this->guard           = new \CrawlPay\Mode_B_Guard();
		$this->http_call_count = 0;
	}

	public function tear_down() {
		remove_all_filters( 'pre_http_request' );
		parent::tear_down();
	}

	/**
	 * @param array $overrides Settings to override.
	 * @return array
	 */
	private function base_settings( array $overrides = array() ) {
		return array_merge(
			\CrawlPay\Settings::default_settings(),
			array( 'middleware_url' => 'https://middleware.example' ),
			$overrides
		);
	}

	/**
	 * @param int   $status_code HTTP status the mocked middleware returns.
	 * @param array $body        Decoded JSON body the mocked middleware returns.
	 * @return void
	 */
	private function mock_http_response( $status_code, array $body ) {
		add_filter(
			'pre_http_request',
			function () use ( $status_code, $body ) {
				++$this->http_call_count;
				return array(
					'headers'  => array(),
					'body'     => wp_json_encode( $body ),
					'response' => array(
						'code'    => $status_code,
						'message' => '',
					),
					'cookies'  => array(),
					'filename' => null,
				);
			}
		);
	}

	/**
	 * @return void
	 */
	private function mock_http_error() {
		add_filter(
			'pre_http_request',
			function () {
				++$this->http_call_count;
				return new WP_Error( 'http_request_failed', 'Connection refused' );
			}
		);
	}

	public function test_passes_in_mode_a() {
		$settings = $this->base_settings( array( 'mode' => 'mode_a' ) );
		$decision = $this->guard->decide( $settings, 'GPTBot/1.0', 'https://example.test/page', '', false );
		$this->assertSame( 'pass', $decision['action'] );
	}

	public function test_passes_when_ai_crawler_policy_is_not_charge() {
		$settings                         = $this->base_settings();
		$settings['policy']['ai-crawler'] = 'allow';
		$decision                         = $this->guard->decide( $settings, 'GPTBot/1.0', 'https://example.test/page', '', false );
		$this->assertSame( 'pass', $decision['action'] );
	}

	public function test_passes_on_admin_requests() {
		$settings = $this->base_settings();
		$decision = $this->guard->decide( $settings, 'GPTBot/1.0', 'https://example.test/page', '', true );
		$this->assertSame( 'pass', $decision['action'] );
	}

	public function test_passes_when_middleware_url_not_configured() {
		$settings = $this->base_settings( array( 'middleware_url' => '' ) );
		$decision = $this->guard->decide( $settings, 'GPTBot/1.0', 'https://example.test/page', '', false );
		$this->assertSame( 'pass', $decision['action'] );
	}

	public function test_passes_for_non_ai_crawler_user_agent() {
		$settings = $this->base_settings();
		$decision = $this->guard->decide( $settings, 'Mozilla/5.0 (an ordinary browser)', 'https://example.test/page', '', false );
		$this->assertSame( 'pass', $decision['action'] );
		$this->assertSame( 0, $this->http_call_count, 'Should never call the middleware for non-ai-crawler traffic.' );
	}

	public function test_blocks_and_caches_quote_when_no_proof_presented() {
		$settings = $this->base_settings();
		$this->mock_http_response(
			200,
			array(
				'action'          => 'charge',
				'paymentRequired' => array(
					'x402Version' => 1,
					'accepts'     => array( array( 'maxAmountRequired' => '10000' ) ),
				),
			)
		);

		$url = 'https://example.test/premium-' . wp_generate_password( 8, false );

		$first = $this->guard->decide( $settings, 'GPTBot/1.0', $url, '', false );
		$this->assertSame( 'block', $first['action'] );
		$this->assertSame( '10000', $first['payload']['accepts'][0]['maxAmountRequired'] );
		$this->assertSame( 1, $this->http_call_count );

		// Same URL again, still within the TTL: served from the transient, no second network call.
		$second = $this->guard->decide( $settings, 'GPTBot/1.0', $url, '', false );
		$this->assertSame( 'block', $second['action'] );
		$this->assertSame( 1, $this->http_call_count, 'Expected the cached quote to be reused instead of calling the middleware again.' );
	}

	public function test_fails_open_when_middleware_unreachable_and_no_proof() {
		$settings = $this->base_settings();
		$this->mock_http_error();

		$url      = 'https://example.test/premium-' . wp_generate_password( 8, false );
		$decision = $this->guard->decide( $settings, 'GPTBot/1.0', $url, '', false );
		$this->assertSame( 'pass', $decision['action'] );

		// A failure must not be cached -- retrying should call the middleware
		// again, not silently keep failing open forever from a cached "no data" state.
		$decision_again = $this->guard->decide( $settings, 'GPTBot/1.0', $url, '', false );
		$this->assertSame( 'pass', $decision_again['action'] );
		$this->assertSame( 2, $this->http_call_count );
	}

	public function test_allows_through_with_a_valid_proof() {
		$settings = $this->base_settings();
		$this->mock_http_response( 200, array( 'action' => 'allow' ) );

		$decision = $this->guard->decide( $settings, 'GPTBot/1.0', 'https://example.test/premium', 'encoded-proof-value', false );

		$this->assertSame( 'pass', $decision['action'] );
	}

	public function test_blocks_with_a_fresh_manifest_when_proof_rejected() {
		$settings = $this->base_settings();
		$this->mock_http_response(
			200,
			array(
				'action'          => 'charge',
				'paymentRequired' => array(
					'x402Version' => 1,
					'error'       => 'Payment required for this resource.',
				),
			)
		);

		$decision = $this->guard->decide( $settings, 'GPTBot/1.0', 'https://example.test/premium', 'stale-or-invalid-proof', false );

		$this->assertSame( 'block', $decision['action'] );
		$this->assertSame( 'Payment required for this resource.', $decision['payload']['error'] );
	}

	public function test_never_caches_a_proof_bearing_request() {
		$settings = $this->base_settings();
		$this->mock_http_response( 200, array( 'action' => 'allow' ) );

		$url = 'https://example.test/premium';
		$this->guard->decide( $settings, 'GPTBot/1.0', $url, 'proof-a', false );
		$this->guard->decide( $settings, 'GPTBot/1.0', $url, 'proof-b', false );

		$this->assertSame( 2, $this->http_call_count, 'Every proof-bearing request must hit the middleware live -- never served from cache.' );
	}

	public function test_fails_open_when_middleware_unreachable_with_proof() {
		$settings = $this->base_settings();
		$this->mock_http_error();

		$decision = $this->guard->decide( $settings, 'GPTBot/1.0', 'https://example.test/premium', 'some-proof', false );

		$this->assertSame( 'pass', $decision['action'] );
	}
}
