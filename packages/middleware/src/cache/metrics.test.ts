import { beforeEach, describe, expect, it } from "vitest";
import { cacheMetrics } from "./metrics";

describe("cacheMetrics", () => {
  beforeEach(() => {
    cacheMetrics.reset();
  });

  it("starts at zero", () => {
    const text = cacheMetrics.toPrometheusText();
    expect(text).toContain("crawlpay_cache_hits_total 0");
    expect(text).toContain("crawlpay_cache_misses_total 0");
  });

  it("counts hits and misses independently", () => {
    cacheMetrics.recordHit();
    cacheMetrics.recordHit();
    cacheMetrics.recordMiss();

    const text = cacheMetrics.toPrometheusText();
    expect(text).toContain("crawlpay_cache_hits_total 2");
    expect(text).toContain("crawlpay_cache_misses_total 1");
  });

  it("emits valid Prometheus text format (HELP/TYPE per metric)", () => {
    const text = cacheMetrics.toPrometheusText();
    expect(text).toMatch(
      /# HELP crawlpay_cache_hits_total .+\n# TYPE crawlpay_cache_hits_total counter/,
    );
    expect(text).toMatch(
      /# HELP crawlpay_cache_misses_total .+\n# TYPE crawlpay_cache_misses_total counter/,
    );
  });
});
