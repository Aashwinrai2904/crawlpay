<?php
/**
 * Tests for the /wp-json/crawlpay/v1/config REST route.
 *
 * @package CrawlPay
 */

/**
 * @covers \CrawlPay\Rest_Config_Controller
 */
class Test_Rest_Config_Controller extends WP_UnitTestCase {

	/**
	 * @var WP_REST_Server
	 */
	protected $server;

	public function set_up() {
		parent::set_up();
		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server();
		$this->server   = $wp_rest_server;
		do_action( 'rest_api_init', $this->server );
	}

	public function tear_down() {
		global $wp_rest_server;
		$wp_rest_server = null;
		delete_option( 'crawlpay_settings' );
		parent::tear_down();
	}

	public function test_route_is_registered() {
		$routes = $this->server->get_routes();
		$this->assertArrayHasKey( '/crawlpay/v1/config', $routes );
	}

	public function test_returns_policy_and_pricing_from_settings() {
		update_option(
			'crawlpay_settings',
			array_merge(
				\CrawlPay\Settings::default_settings(),
				array(
					'pay_to'     => '0xTESTPAYEE0000000000000000000000000000000',
					'max_amount' => '25000',
				)
			)
		);

		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/crawlpay/v1/config' ) );

		$this->assertSame( 200, $response->get_status() );
		$data = $response->get_data();
		$this->assertSame( '25000', $data['pricing']['maxAmountRequired'] );
		$this->assertSame( '0xTESTPAYEE0000000000000000000000000000000', $data['pricing']['payTo'] );
		$this->assertSame( 'charge', $data['policy']['ai-crawler'] );
		$this->assertIsArray( $data['overrides'] );
	}

	public function test_open_when_no_site_key_configured() {
		update_option( 'crawlpay_settings', \CrawlPay\Settings::default_settings() );

		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/crawlpay/v1/config' ) );

		$this->assertSame( 200, $response->get_status() );
	}

	public function test_requires_site_key_when_configured() {
		update_option(
			'crawlpay_settings',
			array_merge( \CrawlPay\Settings::default_settings(), array( 'site_key' => 'top-secret' ) )
		);

		$unauthorized = $this->server->dispatch( new WP_REST_Request( 'GET', '/crawlpay/v1/config' ) );
		$this->assertSame( 401, $unauthorized->get_status() );

		$authorized_request = new WP_REST_Request( 'GET', '/crawlpay/v1/config' );
		$authorized_request->set_header( 'X-Crawlpay-Site-Key', 'top-secret' );
		$authorized = $this->server->dispatch( $authorized_request );
		$this->assertSame( 200, $authorized->get_status() );
	}

	public function test_rejects_wrong_site_key() {
		update_option(
			'crawlpay_settings',
			array_merge( \CrawlPay\Settings::default_settings(), array( 'site_key' => 'top-secret' ) )
		);

		$request = new WP_REST_Request( 'GET', '/crawlpay/v1/config' );
		$request->set_header( 'X-Crawlpay-Site-Key', 'wrong-key' );
		$response = $this->server->dispatch( $request );

		$this->assertSame( 401, $response->get_status() );
	}

	public function test_includes_post_price_overrides() {
		update_option( 'crawlpay_settings', \CrawlPay\Settings::default_settings() );

		$post_id = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		update_post_meta( $post_id, \CrawlPay\Post_Pricing::META_KEY, '99999' );

		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/crawlpay/v1/config' ) );
		$data     = $response->get_data();

		$found = false;
		foreach ( $data['overrides'] as $override ) {
			if ( (int) $override['postId'] === $post_id ) {
				$found = true;
				$this->assertSame( '99999', $override['maxAmountRequired'] );
			}
		}
		$this->assertTrue( $found, 'Expected the post price override to appear in the REST response.' );
	}
}
