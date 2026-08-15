import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryJwksCache, RedisJwksCache, type RedisLikeClient } from "./jwks-cache";

const jwk = { kty: "OKP", crv: "Ed25519", x: "_m_7sSwN0juD1zHC0B1fZL0mTytNzzKGPEqI0c27Iuk" };

describe("InMemoryJwksCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for an unknown key", async () => {
    const cache = new InMemoryJwksCache();
    await expect(cache.get("nope")).resolves.toBeNull();
  });

  it("returns a cached key before it expires", async () => {
    const cache = new InMemoryJwksCache();
    await cache.set("key-1", jwk, 60);
    await expect(cache.get("key-1")).resolves.toEqual(jwk);
  });

  it("expires entries after their TTL", async () => {
    const cache = new InMemoryJwksCache();
    await cache.set("key-1", jwk, 60);

    vi.advanceTimersByTime(61_000);

    await expect(cache.get("key-1")).resolves.toBeNull();
  });
});

describe("RedisJwksCache", () => {
  function fakeRedis(): RedisLikeClient {
    const store = new Map<string, string>();
    return {
      async get(key) {
        return store.get(key) ?? null;
      },
      async set(key, value) {
        store.set(key, value);
        return "OK";
      },
    };
  }

  it("round-trips a key through the injected client", async () => {
    const cache = new RedisJwksCache(fakeRedis());
    await cache.set("key-1", jwk, 3600);
    await expect(cache.get("key-1")).resolves.toEqual(jwk);
  });

  it("returns null when the client has nothing cached", async () => {
    const cache = new RedisJwksCache(fakeRedis());
    await expect(cache.get("missing")).resolves.toBeNull();
  });
});
