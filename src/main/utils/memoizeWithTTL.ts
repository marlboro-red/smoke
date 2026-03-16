/**
 * Generic memoize-with-TTL utility for caching expensive operations.
 * Supports both sync and async functions, manual invalidation, and
 * stale-while-revalidate for background refresh.
 */

export interface MemoizeOptions {
  /** Time-to-live in milliseconds. Cached value expires after this duration. */
  ttlMs: number
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/**
 * Wraps a synchronous function with TTL-based caching.
 * Returns an object with `get()` to retrieve (possibly cached) value,
 * and `invalidate()` to force the next call to re-execute.
 */
export function memoizeWithTTL<T>(
  fn: () => T,
  options: MemoizeOptions
): { get: () => T; invalidate: () => void } {
  let cache: CacheEntry<T> | null = null

  return {
    get(): T {
      const now = Date.now()
      if (cache && now < cache.expiresAt) {
        return cache.value
      }
      const value = fn()
      cache = { value, expiresAt: now + options.ttlMs }
      return value
    },
    invalidate(): void {
      cache = null
    },
  }
}

/**
 * Wraps an async function with TTL-based caching.
 * Deduplicates concurrent calls — if a fetch is already in-flight,
 * subsequent callers receive the same promise.
 * Supports stale-while-revalidate: when TTL expires and a cached value
 * exists, returns the stale value immediately and refreshes in background.
 */
export function memoizeAsyncWithTTL<T>(
  fn: () => Promise<T>,
  options: MemoizeOptions & { staleWhileRevalidate?: boolean }
): { get: () => Promise<T>; invalidate: () => void } {
  let cache: CacheEntry<T> | null = null
  let inflight: Promise<T> | null = null

  function refresh(): Promise<T> {
    if (inflight) return inflight
    inflight = fn()
      .then((value) => {
        cache = { value, expiresAt: Date.now() + options.ttlMs }
        inflight = null
        return value
      })
      .catch((err) => {
        inflight = null
        throw err
      })
    return inflight
  }

  return {
    async get(): Promise<T> {
      const now = Date.now()
      if (cache && now < cache.expiresAt) {
        return cache.value
      }
      // Stale-while-revalidate: return stale value, refresh in background
      if (options.staleWhileRevalidate && cache) {
        refresh().catch(() => {})
        return cache.value
      }
      return refresh()
    },
    invalidate(): void {
      cache = null
    },
  }
}
