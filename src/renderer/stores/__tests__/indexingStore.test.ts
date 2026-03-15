import { describe, it, expect, beforeEach } from 'vitest'
import { indexingStore, computeSearchEta, formatEta } from '../indexingStore'

describe('indexingStore', () => {
  beforeEach(() => {
    indexingStore.setState({
      searchIndexing: false,
      searchIndexed: 0,
      searchTotal: 0,
      searchStartedAt: null,
      searchCompletedAt: null,
      structureAnalyzing: false,
      structureModuleCount: null,
    })
  })

  describe('search indexing', () => {
    it('setSearchProgress updates indexed/total and sets indexing=true', () => {
      indexingStore.getState().setSearchProgress(50, 200)
      const state = indexingStore.getState()
      expect(state.searchIndexing).toBe(true)
      expect(state.searchIndexed).toBe(50)
      expect(state.searchTotal).toBe(200)
      expect(state.searchStartedAt).toBeTypeOf('number')
    })

    it('setSearchProgress preserves startedAt on subsequent calls', () => {
      indexingStore.getState().setSearchProgress(10, 100)
      const firstStartedAt = indexingStore.getState().searchStartedAt
      indexingStore.getState().setSearchProgress(50, 100)
      expect(indexingStore.getState().searchStartedAt).toBe(firstStartedAt)
    })

    it('setSearchIndexing(true) resets progress and sets startedAt', () => {
      indexingStore.getState().setSearchProgress(50, 200)
      indexingStore.getState().setSearchIndexing(true)
      const state = indexingStore.getState()
      expect(state.searchIndexing).toBe(true)
      expect(state.searchIndexed).toBe(0)
      expect(state.searchTotal).toBe(0)
      expect(state.searchStartedAt).toBeTypeOf('number')
      expect(state.searchCompletedAt).toBeNull()
    })

    it('setSearchComplete marks indexing as false and sets completedAt', () => {
      indexingStore.getState().setSearchProgress(100, 100)
      indexingStore.getState().setSearchComplete()
      const state = indexingStore.getState()
      expect(state.searchIndexing).toBe(false)
      expect(state.searchIndexed).toBe(100)
      expect(state.searchCompletedAt).toBeTypeOf('number')
    })
  })

  describe('structure analyzing', () => {
    it('setStructureAnalyzing toggles the flag', () => {
      indexingStore.getState().setStructureAnalyzing(true)
      expect(indexingStore.getState().structureAnalyzing).toBe(true)
      indexingStore.getState().setStructureAnalyzing(false)
      expect(indexingStore.getState().structureAnalyzing).toBe(false)
    })

    it('setStructureComplete sets moduleCount and clears flag', () => {
      indexingStore.getState().setStructureAnalyzing(true)
      indexingStore.getState().setStructureComplete(5)
      const state = indexingStore.getState()
      expect(state.structureAnalyzing).toBe(false)
      expect(state.structureModuleCount).toBe(5)
    })
  })
})

describe('computeSearchEta', () => {
  it('returns null when not indexing', () => {
    const state = indexingStore.getState()
    expect(computeSearchEta(state)).toBeNull()
  })

  it('returns null when indexed is 0', () => {
    indexingStore.setState({
      searchIndexing: true,
      searchIndexed: 0,
      searchTotal: 100,
      searchStartedAt: Date.now() - 1000,
    })
    expect(computeSearchEta(indexingStore.getState())).toBeNull()
  })

  it('computes positive ETA when indexing is in progress', () => {
    const now = Date.now()
    indexingStore.setState({
      searchIndexing: true,
      searchIndexed: 50,
      searchTotal: 100,
      searchStartedAt: now - 5000,
    })
    const eta = computeSearchEta(indexingStore.getState())
    expect(eta).toBeTypeOf('number')
    expect(eta!).toBeGreaterThan(0)
  })

  it('returns small ETA when nearly complete', () => {
    const now = Date.now()
    indexingStore.setState({
      searchIndexing: true,
      searchIndexed: 99,
      searchTotal: 100,
      searchStartedAt: now - 10000,
    })
    const eta = computeSearchEta(indexingStore.getState())
    expect(eta).toBeTypeOf('number')
    // 1 file remaining at ~10 files/sec → ~100ms
    expect(eta!).toBeLessThan(1000)
  })
})

describe('formatEta', () => {
  it('returns null for null input', () => {
    expect(formatEta(null)).toBeNull()
  })

  it('returns null for zero/negative ms', () => {
    expect(formatEta(0)).toBeNull()
    expect(formatEta(-100)).toBeNull()
  })

  it('formats seconds', () => {
    expect(formatEta(3000)).toBe('~3s')
    expect(formatEta(500)).toBe('~1s')
  })

  it('formats minutes + seconds', () => {
    expect(formatEta(90000)).toBe('~1m 30s')
  })

  it('formats exact minutes without seconds', () => {
    expect(formatEta(120000)).toBe('~2m')
  })
})
