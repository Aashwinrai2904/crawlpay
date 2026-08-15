import type { CacheStore, LockStore } from "./types";

interface Entry {
  value: string;
  expiresAtMs: number;
}

interface Lock {
  token: string;
  expiresAtMs: number;
}

/** Real (not a stub) in-process implementation — the default for tests and local `pnpm dev` without Redis. */
export class InMemoryCacheStore implements CacheStore, LockStore {
  private readonly entries = new Map<string, Entry>();
  private readonly locks = new Map<string, Lock>();

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAtMs: Date.now() + ttlSeconds * 1000 });
  }

  async invalidate(pattern: string): Promise<void> {
    const regex = globToRegExp(pattern);
    for (const key of this.entries.keys()) {
      if (regex.test(key)) {
        this.entries.delete(key);
      }
    }
  }

  async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const existing = this.locks.get(key);
    if (existing && existing.expiresAtMs > Date.now()) {
      return false;
    }
    this.locks.set(key, { token, expiresAtMs: Date.now() + ttlMs });
    return true;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    const existing = this.locks.get(key);
    if (existing && existing.token === token) {
      this.locks.delete(key);
    }
  }
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}
