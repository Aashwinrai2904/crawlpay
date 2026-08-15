export interface NonceStore {
  /**
   * Attempts to spend `nonce`. Resolves true the first time a given nonce
   * is consumed, false on every subsequent attempt (a replay).
   */
  consume(nonce: string): Promise<boolean>;
}

export class InMemoryNonceStore implements NonceStore {
  private readonly seen = new Set<string>();

  async consume(nonce: string): Promise<boolean> {
    if (this.seen.has(nonce)) {
      return false;
    }
    this.seen.add(nonce);
    return true;
  }
}

/**
 * Phase 3 work: back this with Redis (SETNX + TTL) so nonce state survives
 * restarts and is shared across middleware instances. Not implemented yet.
 */
export class RedisNonceStore implements NonceStore {
  async consume(_nonce: string): Promise<boolean> {
    throw new Error("RedisNonceStore is not implemented yet (Phase 3).");
  }
}
