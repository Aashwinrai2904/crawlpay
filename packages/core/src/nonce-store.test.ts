import { describe, expect, it } from "vitest";
import { InMemoryNonceStore, RedisNonceStore } from "./nonce-store";

describe("InMemoryNonceStore", () => {
  it("consumes a fresh nonce once and rejects replay", async () => {
    const store = new InMemoryNonceStore();

    await expect(store.consume("nonce-1")).resolves.toBe(true);
    await expect(store.consume("nonce-1")).resolves.toBe(false);
  });

  it("tracks nonces independently", async () => {
    const store = new InMemoryNonceStore();

    await expect(store.consume("nonce-a")).resolves.toBe(true);
    await expect(store.consume("nonce-b")).resolves.toBe(true);
    await expect(store.consume("nonce-a")).resolves.toBe(false);
  });
});

describe("RedisNonceStore", () => {
  it("is not implemented yet", async () => {
    const store = new RedisNonceStore();
    await expect(store.consume("nonce-1")).rejects.toThrow(/not implemented/i);
  });
});
