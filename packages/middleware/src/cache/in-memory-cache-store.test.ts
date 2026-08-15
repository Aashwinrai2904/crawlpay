import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryCacheStore } from "./in-memory-cache-store";

describe("InMemoryCacheStore", () => {
  it("returns null for a missing key", async () => {
    const store = new InMemoryCacheStore();
    await expect(store.get("nope")).resolves.toBeNull();
  });

  it("round-trips a value", async () => {
    const store = new InMemoryCacheStore();
    await store.set("key-1", "value-1", 60);
    await expect(store.get("key-1")).resolves.toBe("value-1");
  });

  it("invalidates keys matching a glob pattern", async () => {
    const store = new InMemoryCacheStore();
    await store.set("page:a", "1", 60);
    await store.set("page:b", "2", 60);
    await store.set("other:c", "3", 60);

    await store.invalidate("page:*");

    await expect(store.get("page:a")).resolves.toBeNull();
    await expect(store.get("page:b")).resolves.toBeNull();
    await expect(store.get("other:c")).resolves.toBe("3");
  });

  describe("expiry", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("expires entries after their TTL", async () => {
      const store = new InMemoryCacheStore();
      await store.set("key-1", "value-1", 60);

      vi.advanceTimersByTime(61_000);

      await expect(store.get("key-1")).resolves.toBeNull();
    });
  });

  describe("locking", () => {
    it("grants the lock to exactly one of two racers", async () => {
      const store = new InMemoryCacheStore();
      const [a, b] = await Promise.all([
        store.acquireLock("lock:x", "token-a", 1000),
        store.acquireLock("lock:x", "token-b", 1000),
      ]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
    });

    it("only releases a lock held by the matching token", async () => {
      const store = new InMemoryCacheStore();
      await store.acquireLock("lock:x", "token-a", 1000);

      await store.releaseLock("lock:x", "token-b");
      await expect(store.acquireLock("lock:x", "token-c", 1000)).resolves.toBe(false);

      await store.releaseLock("lock:x", "token-a");
      await expect(store.acquireLock("lock:x", "token-c", 1000)).resolves.toBe(true);
    });

    it("lets a new holder acquire once the previous lock's TTL expires", async () => {
      vi.useFakeTimers();
      try {
        const store = new InMemoryCacheStore();
        await store.acquireLock("lock:x", "token-a", 100);

        vi.advanceTimersByTime(150);

        await expect(store.acquireLock("lock:x", "token-b", 1000)).resolves.toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
