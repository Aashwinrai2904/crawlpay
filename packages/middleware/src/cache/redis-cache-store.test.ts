import { describe, expect, it } from "vitest";
import { RedisCacheStore, type RedisLikeClient } from "./redis-cache-store";

function fakeRedis(): RedisLikeClient {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    set: (async (key: string, value: string, mode: "EX" | "PX", ttl: number, flag?: "NX") => {
      if (flag === "NX" && store.has(key)) {
        return null;
      }
      store.set(key, value);
      return "OK";
    }) as RedisLikeClient["set"],
    async del(key) {
      const had = store.has(key);
      store.delete(key);
      return had ? 1 : 0;
    },
    async keys(pattern) {
      const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
      return [...store.keys()].filter((k) => regex.test(k));
    },
  };
}

describe("RedisCacheStore", () => {
  it("round-trips get/set", async () => {
    const cache = new RedisCacheStore(fakeRedis());
    await cache.set("key-1", "value-1", 60);
    await expect(cache.get("key-1")).resolves.toBe("value-1");
  });

  it("invalidates keys matching a pattern", async () => {
    const redis = fakeRedis();
    const cache = new RedisCacheStore(redis);
    await cache.set("page:a", "1", 60);
    await cache.set("page:b", "2", 60);
    await cache.set("other:c", "3", 60);

    await cache.invalidate("page:*");

    await expect(cache.get("page:a")).resolves.toBeNull();
    await expect(cache.get("page:b")).resolves.toBeNull();
    await expect(cache.get("other:c")).resolves.toBe("3");
  });

  describe("locking", () => {
    it("acquires an unclaimed lock", async () => {
      const cache = new RedisCacheStore(fakeRedis());
      await expect(cache.acquireLock("lock:x", "token-a", 1000)).resolves.toBe(true);
    });

    it("refuses a lock already held", async () => {
      const cache = new RedisCacheStore(fakeRedis());
      await cache.acquireLock("lock:x", "token-a", 1000);
      await expect(cache.acquireLock("lock:x", "token-b", 1000)).resolves.toBe(false);
    });

    it("releases only when the token matches", async () => {
      const cache = new RedisCacheStore(fakeRedis());
      await cache.acquireLock("lock:x", "token-a", 1000);

      await cache.releaseLock("lock:x", "token-b");
      await expect(cache.acquireLock("lock:x", "token-c", 1000)).resolves.toBe(false);

      await cache.releaseLock("lock:x", "token-a");
      await expect(cache.acquireLock("lock:x", "token-c", 1000)).resolves.toBe(true);
    });
  });
});
