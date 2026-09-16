type CacheEntry<T> = {
  data: T;
  expiry: number;
};

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL = 60000; // 1 minute default

  set(key: string, data: any, ttl: number = this.defaultTTL) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  delete(key: string) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

export const cache = new MemoryCache();
