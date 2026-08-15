<?php
/**
 * Settings > CrawlPay admin page.
 *
 * @package CrawlPay
 */

namespace CrawlPay;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers and renders the plugin's single settings page, and is the
 * source of truth other classes (REST controller, Mode B guard, dashboard
 * widget) read configuration from via get_settings().
 */
class Settings {

	const OPTION_KEY = 'crawlpay_settings';

	const CLASSIFICATIONS = array( 'human', 'search-crawler', 'ai-crawler', 'unknown-bot' );

	const POLICY_ACTIONS = array( 'allow', 'charge', 'block' );

	/**
	 * @return void
	 */
	public function register() {
		add_action( 'admin_menu', array( $this, 'add_settings_page' ) );
		add_action( 'admin_init', array( $this, 'register_setting' ) );
	}

	/**
	 * @return array
	 */
	public static function default_settings() {
		return array(
			// "mode_b" works immediately on activation with no infra changes;
			// "mode_a" (reverse proxy) is the recommended long-term setup once
			// DNS/server config points at the middleware, but requires that
			// setup to actually be in place first.
			'mode'           => 'mode_b',
			'middleware_url' => '',
			'site_key'       => '',
			'pay_to'         => '',
			'network'        => 'base-sepolia',
			'asset'          => 'USDC',
			'max_amount'     => '10000',
			'max_timeout'    => 60,
			'policy'         => array(
				'human'          => 'allow',
				'search-crawler' => 'allow',
				'ai-crawler'     => 'charge',
				'unknown-bot'    => 'block',
			),
		);
	}

	/**
	 * Raw stored settings, merged over the defaults.
	 *
	 * @return array
	 */
	public static function get_raw_settings() {
		$stored = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		$defaults = self::default_settings();
		$merged   = array_merge( $defaults, $stored );
		$merged['policy'] = array_merge( $defaults['policy'], is_array( $stored['policy'] ?? null ) ? $stored['policy'] : array() );
		return $merged;
	}

	/**
	 * Settings reshaped to match the middleware's PublisherConfig
	 * (policy/pricing) — used by the REST config controller and Mode B
	 * guard so both stay byte-for-byte consistent with what Mode A's
	 * middleware would otherwise read from its local publisher-config.json.
	 *
	 * @return array
	 */
	public static function get_publisher_config() {
		$settings = self::get_raw_settings();
		return array(
			'policy'  => $settings['policy'],
			'pricing' => array(
				'network'           => $settings['network'],
				'asset'             => $settings['asset'],
				'maxAmountRequired' => (string) $settings['max_amount'],
				'payTo'             => $settings['pay_to'],
				'maxTimeoutSeconds' => (int) $settings['max_timeout'],
			),
		);
	}

	/**
	 * @return void
	 */
	public function add_settings_page() {
		add_options_page(
			__( 'CrawlPay Settings', 'crawlpay' ),
			__( 'CrawlPay', 'crawlpay' ),
			'manage_options',
			'crawlpay',
			array( $this, 'render_settings_page' )
		);
	}

	/**
	 * @return void
	 */
	public function register_setting() {
		register_setting(
			'crawlpay_settings_group',
			self::OPTION_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => self::default_settings(),
			)
		);
	}

	/**
	 * @param mixed $input Raw form submission.
	 * @return array
	 */
	public function sanitize_settings( $input ) {
		$defaults = self::default_settings();
		if ( ! is_array( $input ) ) {
			return $defaults;
		}

		$output = $defaults;

		$output['mode']           = in_array( $input['mode'] ?? '', array( 'mode_a', 'mode_b' ), true )
			? $input['mode']
			: $defaults['mode'];
		$output['middleware_url'] = isset( $input['middleware_url'] ) ? esc_url_raw( trim( (string) $input['middleware_url'] ) ) : '';
		$output['site_key']       = isset( $input['site_key'] ) ? sanitize_text_field( (string) $input['site_key'] ) : '';
		$output['pay_to']         = isset( $input['pay_to'] ) ? sanitize_text_field( (string) $input['pay_to'] ) : '';
		$output['network']        = isset( $input['network'] ) ? sanitize_text_field( (string) $input['network'] ) : $defaults['network'];
		$output['asset']          = isset( $input['asset'] ) ? sanitize_text_field( (string) $input['asset'] ) : $defaults['asset'];

		$max_amount            = isset( $input['max_amount'] ) ? preg_replace( '/[^0-9]/', '', (string) $input['max_amount'] ) : '';
		$output['max_amount']  = ( '' !== $max_amount ) ? $max_amount : '0';
		$output['max_timeout'] = isset( $input['max_timeout'] ) ? absint( $input['max_timeout'] ) : $defaults['max_timeout'];

		$policy_input = is_array( $input['policy'] ?? null ) ? $input['policy'] : array();
		foreach ( self::CLASSIFICATIONS as $classification ) {
			$value = $policy_input[ $classification ] ?? $defaults['policy'][ $classification ];
			$output['policy'][ $classification ] = in_array( $value, self::POLICY_ACTIONS, true )
				? $value
				: $defaults['policy'][ $classification ];
		}

		return $output;
	}

	/**
	 * @return void
	 */
	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings = self::get_raw_settings();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'CrawlPay', 'crawlpay' ); ?></h1>
			<p>
				<?php esc_html_e( 'CrawlPay lets AI crawlers pay per request for your content. This plugin is a thin bridge to the CrawlPay middleware — it does not process payments itself.', 'crawlpay' ); ?>
			</p>
			<form method="post" action="options.php">
				<?php settings_fields( 'crawlpay_settings_group' ); ?>

				<h2><?php esc_html_e( 'Operating mode', 'crawlpay' ); ?></h2>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Mode', 'crawlpay' ); ?></th>
						<td>
							<label>
								<input type="radio" name="crawlpay_settings[mode]" value="mode_a" <?php checked( $settings['mode'], 'mode_a' ); ?> />
								<?php esc_html_e( 'Mode A — Reverse proxy (recommended)', 'crawlpay' ); ?>
							</label>
							<p class="description">
								<?php esc_html_e( 'Requires pointing your DNS/server config at the CrawlPay middleware in front of WordPress. Once that\'s done, this plugin only manages configuration — the middleware handles every request.', 'crawlpay' ); ?>
							</p>
							<label>
								<input type="radio" name="crawlpay_settings[mode]" value="mode_b" <?php checked( $settings['mode'], 'mode_b' ); ?> />
								<?php esc_html_e( 'Mode B — Works immediately, no infra changes (fallback)', 'crawlpay' ); ?>
							</label>
							<p class="description">
								<?php esc_html_e( 'For shared hosting where you can\'t reconfigure a reverse proxy. Detects AI crawlers by User-Agent only — it cannot verify Web Bot Auth cryptographic signatures the way the middleware can.', 'crawlpay' ); ?>
							</p>
						</td>
					</tr>
				</table>

				<h2><?php esc_html_e( 'Middleware connection', 'crawlpay' ); ?></h2>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="crawlpay_middleware_url"><?php esc_html_e( 'Middleware URL', 'crawlpay' ); ?></label></th>
						<td>
							<input type="url" id="crawlpay_middleware_url" name="crawlpay_settings[middleware_url]" value="<?php echo esc_attr( $settings['middleware_url'] ); ?>" class="regular-text" placeholder="https://crawlpay.example.com" />
							<p class="description"><?php esc_html_e( 'Where the CrawlPay Node middleware is reachable. Used by Mode B for /verify-and-price calls and by the dashboard widget for /stats.', 'crawlpay' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="crawlpay_site_key"><?php esc_html_e( 'Site key', 'crawlpay' ); ?></label></th>
						<td>
							<input type="text" id="crawlpay_site_key" name="crawlpay_settings[site_key]" value="<?php echo esc_attr( $settings['site_key'] ); ?>" class="regular-text" autocomplete="off" />
							<p class="description"><?php esc_html_e( 'Shared secret sent as X-Crawlpay-Site-Key. Must match the middleware\'s CRAWLPAY_SITE_KEY. Leave blank only for local development.', 'crawlpay' ); ?></p>
						</td>
					</tr>
				</table>

				<h2><?php esc_html_e( 'Pricing', 'crawlpay' ); ?></h2>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="crawlpay_pay_to"><?php esc_html_e( 'Payout wallet address', 'crawlpay' ); ?></label></th>
						<td><input type="text" id="crawlpay_pay_to" name="crawlpay_settings[pay_to]" value="<?php echo esc_attr( $settings['pay_to'] ); ?>" class="regular-text" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="crawlpay_network"><?php esc_html_e( 'Network', 'crawlpay' ); ?></label></th>
						<td><input type="text" id="crawlpay_network" name="crawlpay_settings[network]" value="<?php echo esc_attr( $settings['network'] ); ?>" class="regular-text" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="crawlpay_asset"><?php esc_html_e( 'Asset', 'crawlpay' ); ?></label></th>
						<td><input type="text" id="crawlpay_asset" name="crawlpay_settings[asset]" value="<?php echo esc_attr( $settings['asset'] ); ?>" class="regular-text" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="crawlpay_max_amount"><?php esc_html_e( 'Default price (atomic units)', 'crawlpay' ); ?></label></th>
						<td>
							<input type="text" inputmode="numeric" id="crawlpay_max_amount" name="crawlpay_settings[max_amount]" value="<?php echo esc_attr( $settings['max_amount'] ); ?>" class="regular-text" />
							<p class="description"><?php esc_html_e( 'Flat per-request price in the asset\'s smallest unit, e.g. USDC has 6 decimals so 10000 = $0.01. Per-post overrides are available on individual post/page editor screens. Dynamic pricing is not available in this version.', 'crawlpay' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="crawlpay_max_timeout"><?php esc_html_e( 'Payment timeout (seconds)', 'crawlpay' ); ?></label></th>
						<td><input type="number" min="1" id="crawlpay_max_timeout" name="crawlpay_settings[max_timeout]" value="<?php echo esc_attr( $settings['max_timeout'] ); ?>" class="small-text" /></td>
					</tr>
				</table>

				<h2><?php esc_html_e( 'Policy', 'crawlpay' ); ?></h2>
				<p class="description"><?php esc_html_e( 'What happens to each kind of visitor. Mode B only enforces the ai-crawler row — it has no way to detect search-crawler or unknown-bot traffic on its own.', 'crawlpay' ); ?></p>
				<table class="form-table" role="presentation">
					<?php foreach ( self::CLASSIFICATIONS as $classification ) : ?>
						<tr>
							<th scope="row"><?php echo esc_html( $classification ); ?></th>
							<td>
								<select name="crawlpay_settings[policy][<?php echo esc_attr( $classification ); ?>]">
									<?php foreach ( self::POLICY_ACTIONS as $action ) : ?>
										<option value="<?php echo esc_attr( $action ); ?>" <?php selected( $settings['policy'][ $classification ], $action ); ?>>
											<?php echo esc_html( $action ); ?>
										</option>
									<?php endforeach; ?>
								</select>
							</td>
						</tr>
					<?php endforeach; ?>
				</table>

				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
