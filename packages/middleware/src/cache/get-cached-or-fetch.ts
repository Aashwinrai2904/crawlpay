import { randomUUID } from "node:crypto";
import { sleep } from "@crawlpay/core";
import { normalizeCacheKey } from "./key";
import { cacheMetrics } from "./metrics";
import type { CachedResponse, CacheStore, LockStore, OriginResponse } from "./types";

const DEFAULT_TTL_SECONDS = 600;
const LOCK_TTL_MS = 10_000;
const POLL_INTERVAL_MS = 25;
const MAX_WAIT_MS = 5_000;

export interface GetCachedOrFetchOptions {
  store: CacheStore & LockStore;
  ttlSeconds?: number;
}

/**
 * Checks the cache first; on a miss, ensures exactly one caller actually
 * fetches the origin for a given key even under a stampede of concurrent
 * requests — losers of the lock poll for the winner's result instead of
 * fetching themselves.
 */
export async function getCachedOrFetch(
  url: string,
  fetchOrigin: () => Promise<OriginResponse>,
  options: GetCachedOrFetchOptions,
): Promise<CachedResponse> {
  return attempt(url, fetchOrigin, options, Date.now());
}

async function attempt(
  url: string,
  fetchOrigin: () => Promise<OriginResponse>,
  options: GetCachedOrFetchOptions,
  startedAtMs: number,
): Promise<CachedResponse> {
  const { store, ttlSeconds = DEFAULT_TTL_SECONDS } = options;
  const key = normalizeCacheKey(url);

  const cached = await store.get(key);
  if (cached) {
    cacheMetrics.recordHit();
    return { ...(JSON.parse(cached) as OriginResponse), cacheHit: true };
  }

  const lockKey = `lock:${key}`;
  const token = randomUUID();
  const acquired = await store.acquireLock(lockKey, token, LOCK_TTL_MS);

  if (acquired) {
    try {
      // Someone may have finished and published between our GET and acquiring the lock.
      const cachedAfterLock = await store.get(key);
      if (cachedAfterLock) {
        cacheMetrics.recordHit();
        return { ...(JSON.parse(cachedAfterLock) as OriginResponse), cacheHit: true };
      }

      cacheMetrics.recordMiss();
      const origin = await fetchOrigin();
      await store.set(key, JSON.stringify(origin), ttlSeconds);
      return { ...origin, cacheHit: false };
    } finally {
      await store.releaseLock(lockKey, token);
    }
  }

  if (Date.now() - startedAtMs > MAX_WAIT_MS) {
    throw new Error(`getCachedOrFetch: timed out waiting for the in-flight fetch of "${key}"`);
  }
  await sleep(POLL_INTERVAL_MS);
  return attempt(url, fetchOrigin, options, startedAtMs);
}
