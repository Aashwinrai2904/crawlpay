import Redis from "ioredis";
import type { CacheStore, LockStore } from "./types";

/**
 * Minimal structural subset of ioredis's client — a real Redis instance
 * satisfies this without any adapter, and tests inject a fake instead of
 * needing a live Redis server.
 */
export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  set(key: string, value: string, mode: "PX", ttlMs: number, flag: "NX"): Promise<"OK" | null>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

const DEFAULT_REDIS_URL = process.env.CRAWLPAY_REDIS_URL ?? "redis://localhost:6379";

export class RedisCacheStore implements CacheStore, LockStore {
  constructor(private readonly redis: RedisLikeClient = new Redis(DEFAULT_REDIS_URL)) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, "EX", ttlSeconds);
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    await Promise.all(keys.map((key) => this.redis.del(key)));
  }

  async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(key, token, "PX", ttlMs, "NX");
    return result === "OK";
  }

  /**
   * GET-then-DEL rather than an atomic Lua compare-and-delete: the lock's
   * TTL is the real safety net, so a race here just means an occasional
   * early release (a fresh acquirer starts a hair sooner), not a stuck
   * lock or a correctness break.
   */
  async releaseLock(key: string, token: string): Promise<void> {
    const current = await this.redis.get(key);
    if (current === token) {
      await this.redis.del(key);
    }
  }
}
