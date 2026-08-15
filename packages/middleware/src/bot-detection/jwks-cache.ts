import type { Ed25519Jwk } from "./jwks-thumbprint";

export interface JwksCache {
  /** Looks up a previously cached key by its thumbprint (keyid). */
  get(keyId: string): Promise<Ed25519Jwk | null>;
  set(keyId: string, jwk: Ed25519Jwk, ttlSeconds: number): Promise<void>;
}

interface CacheEntry {
  jwk: Ed25519Jwk;
  expiresAtMs: number;
}

export class InMemoryJwksCache implements JwksCache {
  private readonly entries = new Map<string, CacheEntry>();

  async get(keyId: string): Promise<Ed25519Jwk | null> {
    const entry = this.entries.get(keyId);
    if (!entry) {
      return null;
    }
    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(keyId);
      return null;
    }
    return entry.jwk;
  }

  async set(keyId: string, jwk: Ed25519Jwk, ttlSeconds: number): Promise<void> {
    this.entries.set(keyId, { jwk, expiresAtMs: Date.now() + ttlSeconds * 1000 });
  }
}

/**
 * Minimal structural subset of a Redis client (satisfied by ioredis without
 * middleware needing to depend on it directly — callers inject a real
 * client at the HTTP-wiring layer in Phase 4).
 */
export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
}

const CACHE_KEY_PREFIX = "crawlpay:jwks:";

export class RedisJwksCache implements JwksCache {
  constructor(private readonly redis: RedisLikeClient) {}

  async get(keyId: string): Promise<Ed25519Jwk | null> {
    const raw = await this.redis.get(CACHE_KEY_PREFIX + keyId);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as Ed25519Jwk;
    } catch {
      return null;
    }
  }

  async set(keyId: string, jwk: Ed25519Jwk, ttlSeconds: number): Promise<void> {
    await this.redis.set(CACHE_KEY_PREFIX + keyId, JSON.stringify(jwk), "EX", ttlSeconds);
  }
}
