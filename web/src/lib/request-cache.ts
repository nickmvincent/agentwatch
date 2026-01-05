/**
 * Request Cache - Deduplication and caching for API requests
 *
 * Provides:
 * - Request deduplication (same endpoint = single in-flight request)
 * - Short-term caching with configurable TTL
 * - Type-safe fetching
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class RequestCache {
  private inFlight: Map<string, Promise<unknown>> = new Map();
  private cache: Map<string, CacheEntry<unknown>> = new Map();

  /**
   * Fetch with deduplication and caching.
   *
   * If a request for the same key is already in flight, returns that promise.
   * If cached data exists and is fresh (within TTL), returns cached data.
   * Otherwise, starts a new request.
   *
   * @param key - Cache key (typically the endpoint URL)
   * @param fetcher - Function that performs the actual fetch
   * @param ttl - Time-to-live in milliseconds (default: 30s)
   */
  async fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 30000
  ): Promise<T> {
    // Return cached if fresh
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data as T;
    }

    // Return in-flight if exists (deduplication)
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key) as Promise<T>;
    }

    // Start new request
    const promise = fetcher()
      .then((data) => {
        this.cache.set(key, { data, timestamp: Date.now() });
        this.inFlight.delete(key);
        return data;
      })
      .catch((error) => {
        this.inFlight.delete(key);
        throw error;
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Invalidate cache for specific keys.
   */
  invalidate(...keys: string[]): void {
    for (const key of keys) {
      this.cache.delete(key);
    }
  }

  /**
   * Invalidate all cached data.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Check if a key has fresh cached data.
   */
  isCached(key: string, ttl: number = 30000): boolean {
    const cached = this.cache.get(key);
    return cached !== undefined && Date.now() - cached.timestamp < ttl;
  }

  /**
   * Get cached data without fetching.
   * Returns undefined if not cached or stale.
   */
  getCached<T>(key: string, ttl: number = 30000): T | undefined {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data as T;
    }
    return undefined;
  }
}

// Singleton instance for use across the app
export const requestCache = new RequestCache();

// Export class for custom instances if needed
export { RequestCache };
