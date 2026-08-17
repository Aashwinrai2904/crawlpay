import { PublisherConfigSchema, type PublisherConfig } from "./publisher-config";
import type { PublisherConfigSource } from "./publisher-config-source";

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface DashboardPublisherConfigSourceOptions {
  /** Base URL of the Phase 6 publisher dashboard, e.g. "https://dashboard.example.com". */
  dashboardUrl: string;
  /** Bearer secret from that site's Setup page — this dashboard's equivalent of a WP plugin site key. */
  deployKey: string;
  fallback: PublisherConfig;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  onPollError?: (err: unknown) => void;
}

/**
 * Polls the Phase 6 publisher dashboard's GET /api/v1/config for a
 * dashboard-managed site, so payTo/pricing/policy set there actually reach
 * this middleware. Same polling/fallback/fail-open shape as
 * WordPressPublisherConfigSource (see that class's docblock for the
 * reasoning) -- kept as a separate class rather than sharing a base with
 * it because the two are each self-contained and this project already
 * favors parallel single-purpose implementations over a shared abstraction
 * (see ConsoleTransactionLog/PostgresTransactionLog/DashboardTransactionLog).
 */
export class DashboardPublisherConfigSource implements PublisherConfigSource {
  private current: PublisherConfig;
  private readonly endpoint: string;
  private readonly deployKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onPollError: (err: unknown) => void;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(options: DashboardPublisherConfigSourceOptions) {
    this.current = options.fallback;
    this.endpoint = new URL("/api/v1/config", options.dashboardUrl).toString();
    this.deployKey = options.deployKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onPollError =
      options.onPollError ??
      ((err) => console.error("[crawlpay] failed to poll dashboard config:", err));

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
      const response = await this.fetchImpl(this.endpoint, {
        headers: { authorization: `Bearer ${this.deployKey}` },
      });
      if (!response.ok) {
        this.onPollError(new Error(`dashboard config endpoint returned ${response.status}`));
        return;
      }
      this.current = PublisherConfigSchema.parse(await response.json());
    } catch (err) {
      this.onPollError(err);
    }
  }
}
