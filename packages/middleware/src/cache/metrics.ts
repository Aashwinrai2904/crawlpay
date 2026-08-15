/** In-memory cache hit/miss counters, exposed as Prometheus text via GET /metrics. */
class CacheHitRateMetrics {
  private hits = 0;
  private misses = 0;

  recordHit(): void {
    this.hits += 1;
  }

  recordMiss(): void {
    this.misses += 1;
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
  }

  toPrometheusText(): string {
    return (
      [
        "# HELP crawlpay_cache_hits_total Total number of origin cache hits.",
        "# TYPE crawlpay_cache_hits_total counter",
        `crawlpay_cache_hits_total ${this.hits}`,
        "# HELP crawlpay_cache_misses_total Total number of origin cache misses (origin fetches).",
        "# TYPE crawlpay_cache_misses_total counter",
        `crawlpay_cache_misses_total ${this.misses}`,
      ].join("\n") + "\n"
    );
  }
}

export const cacheMetrics = new CacheHitRateMetrics();
