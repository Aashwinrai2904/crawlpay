export interface OriginResponse {
  body: string;
  headers: Record<string, string>;
  status: number;
}

export interface CachedResponse extends OriginResponse {
  /** true if served from cache; false if this call performed (or waited on) an origin fetch. */
  cacheHit: boolean;
}

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Deletes every key matching a Redis-style glob pattern (e.g. "page:*"). */
  invalidate(pattern: string): Promise<void>;
}

/**
 * Separate from CacheStore because a plain cache get/set can't express
 * atomic "claim this key or tell me someone else already has" semantics —
 * getCachedOrFetch needs that to dedupe a stampede of concurrent misses.
 */
export interface LockStore {
  /** Atomically claims `key` only if unclaimed, for `ttlMs`. Returns whether it was acquired. */
  acquireLock(key: string, token: string, ttlMs: number): Promise<boolean>;
  /** Releases `key` only if still held by `token` (a lock we no longer own is left alone). */
  releaseLock(key: string, token: string): Promise<void>;
}
