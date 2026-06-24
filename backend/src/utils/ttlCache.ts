/** Minimal in-process TTL cache for read-mostly values (settings, config). Not multi-process. */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private readonly ttlMs: number;

  constructor(ttlMs: number, private readonly defaultTtlMs = 30_000) {
    // Guard against NaN / Infinity / negative values (e.g. from a bad env var).
    // Falls back to defaultTtlMs so the cache stays functional rather than silently immortal.
    this.ttlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : defaultTtlMs;
  }

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
