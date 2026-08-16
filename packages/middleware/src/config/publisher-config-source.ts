import { PublisherConfigSchema, type PublisherConfig } from "./publisher-config";

const SITE_KEY_HEADER = "x-crawlpay-site-key";
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface PublisherConfigSource {
  getConfig(): PublisherConfig;
  stop?(): void;
}

/** Wraps a config that was loaded once at startup and never changes — the pre-existing behavior. */
export class StaticPublisherConfigSource implements PublisherConfigSource {
  constructor(private readonly config: PublisherConfig) {}

  getConfig(): PublisherConfig {
    return this.config;
  }
}

export interface WordPressPublisherConfigSourceOptions {
  /** Base URL of the WordPress site, e.g. "https://example.com". */
  wordpressUrl: string;
  /** Sent as X-Crawlpay-Site-Key; must match the WP plugin's Settings > CrawlPay > Site key. */
  siteKey?: string;
  /** Served until the first poll succeeds, and again if every subsequent poll fails. */
  fallback: PublisherConfig;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  onPollError?: (err: unknown) => void;
}

/**
 * Polls the WordPress plugin's GET /wp-json/crawlpay/v1/config on an
 * interval and serves whatever it last fetched successfully. This is how
 * payTo/pricing/policy set on the Settings > CrawlPay page actually reach
 * the middleware instead of its local publisher-config.json placeholder.
 *
 * getConfig() always returns synchronously from an in-memory value — no
 * request ever blocks on a call to WordPress. Before the first poll
 * completes, and whenever WordPress is unreachable or returns something
 * that doesn't parse, it keeps serving the last-known-good config (starting
 * from `fallback`) rather than failing the request. This mirrors Mode B's
 * own fail-open bias in class-mode-b-guard.php, just on the other side of
 * the connection: an outage should degrade to stale pricing, not a broken
 * site or a hard failure to serve paying crawlers.
 */
export class WordPressPublisherConfigSource implements PublisherConfigSource {
  private current: PublisherConfig;
  private readonly endpoint: string;
  private readonly siteKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onPollError: (err: unknown) => void;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(options: WordPressPublisherConfigSourceOptions) {
    this.current = options.fallback;
    this.endpoint = new URL("/wp-json/crawlpay/v1/config", options.wordpressUrl).toString();
    this.siteKey = options.siteKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onPollError =
      options.onPollError ??
      ((err) => console.error("[crawlpay] failed to poll WordPress config:", err));

    void this.poll();
    this.timer = setInterval(
      () => void this.poll(),
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    );
    this.timer.unref?.();
  }

  getConfig(): PublisherConfig {
    return this.current;
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    try {
      const headers: Record<string, string> = {};
      if (this.siteKey) {
        headers[SITE_KEY_HEADER] = this.siteKey;
      }
      const response = await this.fetchImpl(this.endpoint, { headers });
      if (!response.ok) {
        this.onPollError(new Error(`WordPress config endpoint returned ${response.status}`));
        return;
      }
      this.current = PublisherConfigSchema.parse(await response.json());
    } catch (err) {
      this.onPollError(err);
    }
  }
}
