import { describe, it, expect, beforeEach } from 'vitest'
import {
  getCachedImports,
  setCachedImports,
  invalidateCachedImports,
  clearImportCache,
  registerGraphNode,
  unregisterGraphNode,
  getGraphSessionId,
  isInActiveGraph,
  getActiveGraphEntries,
  clearActiveGraph,
  diffImports,
} from '../GraphCache'

describe('GraphCache', () => {
  beforeEach(() => {
    clearImportCache()
    clearActiveGraph()
  })

  describe('import cache', () => {
    it('stores and retrieves cached imports', () => {
      setCachedImports('/src/a.ts', ['/src/b.ts', '/src/c.ts'])
      const cached = getCachedImports('/src/a.ts')
      expect(cached).toBeDefined()
      expect(cached!.resolvedPaths).toEqual(['/src/b.ts', '/src/c.ts'])
    })

    it('returns undefined for uncached files', () => {
      expect(getCachedImports('/not-cached.ts')).toBeUndefined()
    })

    it('invalidates a cache entry and returns old value', () => {
      setCachedImports('/src/a.ts', ['/src/b.ts'])
      const old = invalidateCachedImports('/src/a.ts')
      expect(old).toBeDefined()
      expect(old!.resolvedPaths).toEqual(['/src/b.ts'])
      expect(getCachedImports('/src/a.ts')).toBeUndefined()
    })

    it('invalidate returns undefined for uncached files', () => {
      expect(invalidateCachedImports('/nope')).toBeUndefined()
    })

    it('clears all cached imports', () => {
      setCachedImports('/src/a.ts', ['/src/b.ts'])
      setCachedImports('/src/c.ts', ['/src/d.ts'])
      clearImportCache()
      expect(getCachedImports('/src/a.ts')).toBeUndefined()
      expect(getCachedImports('/src/c.ts')).toBeUndefined()
    })

    it('overwrites existing cache entries', () => {
      setCachedImports('/src/a.ts', ['/src/b.ts'])
      setCachedImports('/src/a.ts', ['/src/c.ts', '/src/d.ts'])
      const cached = getCachedImports('/src/a.ts')
      expect(cached!.resolvedPaths).toEqual(['/src/c.ts', '/src/d.ts'])
    })
  })

  describe('active graph', () => {
    it('registers and retrieves graph nodes', () => {
      registerGraphNode('/src/a.ts', 'session-1')
      expect(getGraphSessionId('/src/a.ts')).toBe('session-1')
      expect(isInActiveGraph('/src/a.ts')).toBe(true)
    })

    it('returns undefined for unregistered paths', () => {
      expect(getGraphSessionId('/not-registered.ts')).toBeUndefined()
      expect(isInActiveGraph('/not-registered.ts')).toBe(false)
    })

    it('unregisters a graph node', () => {
      registerGraphNode('/src/a.ts', 'session-1')
      unregisterGraphNode('/src/a.ts')
      expect(isInActiveGraph('/src/a.ts')).toBe(false)
    })

    it('returns all active graph entries', () => {
      registerGraphNode('/src/a.ts', 'session-1')
      registerGraphNode('/src/b.ts', 'session-2')
      const entries = getActiveGraphEntries()
      expect(entries.size).toBe(2)
      expect(entries.get('/src/a.ts')).toBe('session-1')
      expect(entries.get('/src/b.ts')).toBe('session-2')
    })

    it('clears all active graph entries', () => {
      registerGraphNode('/src/a.ts', 'session-1')
      registerGraphNode('/src/b.ts', 'session-2')
      clearActiveGraph()
      expect(getActiveGraphEntries().size).toBe(0)
    })
  })

  describe('diffImports', () => {
    it('detects added imports', () => {
      const diff = diffImports(['/a.ts'], ['/a.ts', '/b.ts'])
      expect(diff.added).toEqual(['/b.ts'])
      expect(diff.removed).toEqual([])
    })

    it('detects removed imports', () => {
      const diff = diffImports(['/a.ts', '/b.ts'], ['/a.ts'])
      expect(diff.added).toEqual([])
      expect(diff.removed).toEqual(['/b.ts'])
    })

    it('detects both added and removed', () => {
      const diff = diffImports(['/a.ts', '/b.ts'], ['/b.ts', '/c.ts'])
      expect(diff.added).toEqual(['/c.ts'])
      expect(diff.removed).toEqual(['/a.ts'])
    })

    it('returns empty diff for identical lists', () => {
      const diff = diffImports(['/a.ts', '/b.ts'], ['/a.ts', '/b.ts'])
      expect(diff.added).toEqual([])
      expect(diff.removed).toEqual([])
    })

    it('handles empty old list', () => {
      const diff = diffImports([], ['/a.ts', '/b.ts'])
      expect(diff.added).toEqual(['/a.ts', '/b.ts'])
      expect(diff.removed).toEqual([])
    })

    it('handles empty new list', () => {
      const diff = diffImports(['/a.ts', '/b.ts'], [])
      expect(diff.added).toEqual([])
      expect(diff.removed).toEqual(['/a.ts', '/b.ts'])
    })

    it('handles both empty', () => {
      const diff = diffImports([], [])
      expect(diff.added).toEqual([])
      expect(diff.removed).toEqual([])
    })
  })
})
