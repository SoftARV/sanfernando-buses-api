interface CacheEntry<V> {
  value: V;
  expiresAt: number | null;
}

export class Cache<K, V> {
  private store = new Map<K, CacheEntry<V>>();

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : null,
    });
  }
}
