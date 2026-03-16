import { describe, it, expect, beforeEach, vi } from 'vitest'
import { indexingStore, computeSearchEta, formatEta } from '../../stores/indexingStore'

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

  it('starts with no indexing in progress', () => {
    const state = indexingStore.getState()
    expect(state.searchIndexing).toBe(false)
    expect(state.searchIndexed).toBe(0)
    expect(state.searchTotal).toBe(0)
    expect(state.structureAnalyzing).toBe(false)
  })

  it('setSearchProgress updates indexed/total and enables indexing', () => {
    indexingStore.getState().setSearchProgress(50, 200)

    const state = indexingStore.getState()
    expect(state.searchIndexing).toBe(true)
    expect(state.searchIndexed).toBe(50)
    expect(state.searchTotal).toBe(200)
    expect(state.searchStartedAt).toBeTypeOf('number')
  })

  it('setSearchProgress preserves existing startedAt', () => {
    indexingStore.getState().setSearchProgress(10, 100)
    const firstStartedAt = indexingStore.getState().searchStartedAt

    indexingStore.getState().setSearchProgress(50, 100)
    expect(indexingStore.getState().searchStartedAt).toBe(firstStartedAt)
  })

  it('setSearchIndexing(true) resets progress', () => {
    indexingStore.getState().setSearchProgress(50, 100)
    indexingStore.getState().setSearchIndexing(true)

    const state = indexingStore.getState()
    expect(state.searchIndexing).toBe(true)
    expect(state.searchIndexed).toBe(0)
    expect(state.searchTotal).toBe(0)
    expect(state.searchCompletedAt).toBeNull()
  })

  it('setSearchComplete finalizes progress', () => {
    indexingStore.getState().setSearchProgress(50, 100)
    indexingStore.getState().setSearchComplete()

    const state = indexingStore.getState()
    expect(state.searchIndexing).toBe(false)
    expect(state.searchIndexed).toBe(100) // Set to total
    expect(state.searchCompletedAt).toBeTypeOf('number')
  })

  it('setStructureAnalyzing toggles the flag', () => {
    indexingStore.getState().setStructureAnalyzing(true)
    expect(indexingStore.getState().structureAnalyzing).toBe(true)

    indexingStore.getState().setStructureAnalyzing(false)
    expect(indexingStore.getState().structureAnalyzing).toBe(false)
  })

  it('setStructureComplete sets moduleCount and clears flag', () => {
    indexingStore.getState().setStructureAnalyzing(true)
    indexingStore.getState().setStructureComplete(42)

    const state = indexingStore.getState()
    expect(state.structureAnalyzing).toBe(false)
    expect(state.structureModuleCount).toBe(42)
  })
})

describe('computeSearchEta', () => {
  it('returns null when not indexing', () => {
    const result = computeSearchEta({
      searchIndexing: false,
      searchIndexed: 50,
      searchTotal: 100,
      searchStartedAt: Date.now() - 5000,
      searchCompletedAt: null,
      structureAnalyzing: false,
      structureModuleCount: null,
      setSearchProgress: vi.fn(),
      setSearchIndexing: vi.fn(),
      setSearchComplete: vi.fn(),
      setStructureAnalyzing: vi.fn(),
      setStructureComplete: vi.fn(),
    })
    expect(result).toBeNull()
  })

  it('returns null when no startedAt', () => {
    const result = computeSearchEta({
      searchIndexing: true,
      searchIndexed: 50,
      searchTotal: 100,
      searchStartedAt: null,
      searchCompletedAt: null,
      structureAnalyzing: false,
      structureModuleCount: null,
      setSearchProgress: vi.fn(),
      setSearchIndexing: vi.fn(),
      setSearchComplete: vi.fn(),
      setStructureAnalyzing: vi.fn(),
      setStructureComplete: vi.fn(),
    })
    expect(result).toBeNull()
  })

  it('returns null when indexed is 0', () => {
    const result = computeSearchEta({
      searchIndexing: true,
      searchIndexed: 0,
      searchTotal: 100,
      searchStartedAt: Date.now() - 5000,
      searchCompletedAt: null,
      structureAnalyzing: false,
      structureModuleCount: null,
      setSearchProgress: vi.fn(),
      setSearchIndexing: vi.fn(),
      setSearchComplete: vi.fn(),
      setStructureAnalyzing: vi.fn(),
      setStructureComplete: vi.fn(),
    })
    expect(result).toBeNull()
  })

  it('returns positive number for valid in-progress indexing', () => {
    const result = computeSearchEta({
      searchIndexing: true,
      searchIndexed: 50,
      searchTotal: 100,
      searchStartedAt: Date.now() - 5000,
      searchCompletedAt: null,
      structureAnalyzing: false,
      structureModuleCount: null,
      setSearchProgress: vi.fn(),
      setSearchIndexing: vi.fn(),
      setSearchComplete: vi.fn(),
      setStructureAnalyzing: vi.fn(),
      setStructureComplete: vi.fn(),
    })
    expect(result).toBeTypeOf('number')
    expect(result!).toBeGreaterThan(0)
  })
})

describe('formatEta', () => {
  it('returns null for null input', () => {
    expect(formatEta(null)).toBeNull()
  })

  it('returns null for zero', () => {
    expect(formatEta(0)).toBeNull()
  })

  it('returns null for negative values', () => {
    expect(formatEta(-1000)).toBeNull()
  })

  it('formats seconds for values under 60s', () => {
    expect(formatEta(5000)).toBe('~5s')
    expect(formatEta(30000)).toBe('~30s')
    expect(formatEta(500)).toBe('~1s')
  })

  it('formats minutes and seconds for values >= 60s', () => {
    expect(formatEta(90000)).toBe('~1m 30s')
    expect(formatEta(125000)).toBe('~2m 5s')
  })

  it('formats exact minutes without seconds', () => {
    expect(formatEta(60000)).toBe('~1m')
    expect(formatEta(120000)).toBe('~2m')
  })
})
