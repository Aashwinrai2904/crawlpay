<?php
/**
 * Per-post/page pricing override meta box.
 *
 * @package CrawlPay
 */

namespace CrawlPay;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Lets a site owner override the site-wide default price for one specific
 * post or page. Stored as protected post meta (leading underscore keeps it
 * out of the generic Custom Fields UI) and exposed to Mode A's middleware
 * via the REST config endpoint. Mode B's synchronous /verify-and-price
 * check does not currently look these overrides up — it only knows the
 * site-wide default (see Mode_B_Guard).
 */
class Post_Pricing {

	const META_KEY     = '_crawlpay_price_override';
	const NONCE_ACTION = 'crawlpay_price_override_save';
	const NONCE_FIELD  = 'crawlpay_price_override_nonce';
	const POST_TYPES   = array( 'post', 'page' );

	/**
	 * @return void
	 */
	public function register() {
		add_action( 'add_meta_boxes', array( $this, 'add_meta_box' ) );
		add_action( 'save_post', array( $this, 'save' ) );
	}

	/**
	 * @return void
	 */
	public function add_meta_box() {
		foreach ( self::POST_TYPES as $post_type ) {
			add_meta_box(
				'crawlpay_price_override',
				__( 'CrawlPay Pricing', 'crawlpay' ),
				array( $this, 'render' ),
				$post_type,
				'side',
				'default'
			);
		}
	}

	/**
	 * @param \WP_Post $post Current post.
	 * @return void
	 */
	public function render( $post ) {
		wp_nonce_field( self::NONCE_ACTION, self::NONCE_FIELD );
		$value           = get_post_meta( $post->ID, self::META_KEY, true );
		$default_amount  = Settings::get_raw_settings()['max_amount'];
		$placeholder     = sprintf(
			/* translators: %s: site-wide default price in atomic units */
			__( 'Default: %s', 'crawlpay' ),
			$default_amount
		);
		?>
		<p>
			<label for="crawlpay_price_override_field"><?php esc_html_e( 'Price override (atomic units)', 'crawlpay' ); ?></label>
			<input
				type="text"
				inputmode="numeric"
				id="crawlpay_price_override_field"
				name="crawlpay_price_override"
				value="<?php echo esc_attr( $value ); ?>"
				class="widefat"
				placeholder="<?php echo esc_attr( $placeholder ); ?>"
			/>
		</p>
		<p class="description">
			<?php esc_html_e( 'Leave blank to use the site-wide default price set in Settings > CrawlPay.', 'crawlpay' ); ?>
		</p>
		<?php
	}

	/**
	 * @param int $post_id Post being saved.
	 * @return void
	 */
	public function save( $post_id ) {
		if ( ! isset( $_POST[ self::NONCE_FIELD ] ) ) {
			return;
		}
		$nonce = sanitize_text_field( wp_unslash( $_POST[ self::NONCE_FIELD ] ) );
		if ( ! wp_verify_nonce( $nonce, self::NONCE_ACTION ) ) {
			return;
		}
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$raw    = isset( $_POST['crawlpay_price_override'] ) ? sanitize_text_field( wp_unslash( $_POST['crawlpay_price_override'] ) ) : '';
		$digits = preg_replace( '/[^0-9]/', '', $raw );

		if ( '' === $digits ) {
			delete_post_meta( $post_id, self::META_KEY );
			return;
		}
		update_post_meta( $post_id, self::META_KEY, $digits );
	}

	/**
	 * Every post/page with a price override set, for REST exposure to the
	 * middleware.
	 *
	 * @return array
	 */
	public static function get_all_overrides() {
		$query = new \WP_Query(
			array(
				'post_type'      => self::POST_TYPES,
				'post_status'    => 'publish',
				'posts_per_page' => -1,
				'meta_key'       => self::META_KEY, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- polled occasionally by the middleware, not a page-load path.
				'fields'         => 'ids',
			)
		);

		$overrides = array();
		foreach ( $query->posts as $post_id ) {
			$amount = get_post_meta( $post_id, self::META_KEY, true );
			if ( '' === $amount ) {
				continue;
			}
			$overrides[] = array(
				'postId'            => $post_id,
				'url'               => get_permalink( $post_id ),
				'maxAmountRequired' => (string) $amount,
			);
		}
		return $overrides;
	}
}
