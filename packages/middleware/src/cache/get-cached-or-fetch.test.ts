import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sleep } from "@crawlpay/core";
import { getCachedOrFetch } from "./get-cached-or-fetch";
import { InMemoryCacheStore } from "./in-memory-cache-store";
import { cacheMetrics } from "./metrics";
import type { OriginResponse } from "./types";

const URL_UNDER_TEST = "https://publisher.example/premium-article";

const origin: OriginResponse = {
  body: "<html>fresh</html>",
  headers: { "content-type": "text/html" },
  status: 200,
};

describe("getCachedOrFetch", () => {
  beforeEach(() => {
    cacheMetrics.reset();
  });

  it("returns a cache hit without calling fetchOrigin", async () => {
    const store = new InMemoryCacheStore();
    await store.set("publisher.example/premium-article", JSON.stringify(origin), 600);
    const fetchOrigin = vi.fn(async () => origin);

    const result = await getCachedOrFetch(URL_UNDER_TEST, fetchOrigin, { store });

    expect(fetchOrigin).not.toHaveBeenCalled();
    expect(result).toEqual({ ...origin, cacheHit: true });
  });

  it("fetches and populates the cache on a miss", async () => {
    const store = new InMemoryCacheStore();
    const fetchOrigin = vi.fn(async () => origin);

    const result = await getCachedOrFetch(URL_UNDER_TEST, fetchOrigin, { store });

    expect(fetchOrigin).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ...origin, cacheHit: false });

    const cached = await store.get("publisher.example/premium-article");
    expect(cached).toBe(JSON.stringify(origin));
  });

  it("dedupes a stampede of concurrent requests into exactly one origin fetch", async () => {
    const store = new InMemoryCacheStore();
    let inFlight = 0;
    let maxConcurrentFetches = 0;
    const fetchOrigin = vi.fn(async () => {
      inFlight += 1;
      maxConcurrentFetches = Math.max(maxConcurrentFetches, inFlight);
      await sleep(30);
      inFlight -= 1;
      return origin;
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => getCachedOrFetch(URL_UNDER_TEST, fetchOrigin, { store })),
    );

    expect(fetchOrigin).toHaveBeenCalledTimes(1);
    expect(maxConcurrentFetches).toBe(1);
    for (const result of results) {
      expect(result.body).toBe(origin.body);
      expect(result.status).toBe(origin.status);
      expect(result.headers).toEqual(origin.headers);
    }
    // Whichever caller won the lock gets cacheHit:false; every other caller,
    // having waited for that result, gets cacheHit:true.
    expect(results.filter((r) => !r.cacheHit)).toHaveLength(1);
    expect(results.filter((r) => r.cacheHit)).toHaveLength(19);
  });

  describe("TTL expiry", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("re-fetches once the cached entry's TTL has passed", async () => {
      const store = new InMemoryCacheStore();
      const fetchOrigin = vi.fn(async () => origin);

      await getCachedOrFetch(URL_UNDER_TEST, fetchOrigin, { store, ttlSeconds: 60 });
      expect(fetchOrigin).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(30_000);
      await getCachedOrFetch(URL_UNDER_TEST, fetchOrigin, { store, ttlSeconds: 60 });
      expect(fetchOrigin).toHaveBeenCalledTimes(1); // still within TTL

      vi.advanceTimersByTime(31_000);
      await getCachedOrFetch(URL_UNDER_TEST, fetchOrigin, { store, ttlSeconds: 60 });
      expect(fetchOrigin).toHaveBeenCalledTimes(2); // TTL passed, re-fetched
    });
  });
});
