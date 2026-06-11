import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// In-memory stand-in for the electron-store file (hoisted: the vi.mock
// factory below runs before module-level const initializers)
const { mockData, storeSet } = vi.hoisted(() => {
  const mockData: Record<string, unknown> = {}
  const storeSet = vi.fn((keyOrObj: unknown, value?: unknown) => {
    if (typeof keyOrObj === 'object' && keyOrObj !== null) {
      Object.assign(mockData, keyOrObj)
    } else {
      mockData[keyOrObj as string] = value
    }
  })
  return { mockData, storeSet }
})

vi.mock('electron-store', () => ({
  default: class MockStore {
    get = vi.fn((key: string, def?: unknown) => mockData[key] ?? def)
    set = storeSet
  },
}))

import { deferredConfig, flushConfigWrites } from '../ConfigStore'

describe('DeferredConfigWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    storeSet.mockClear()
    for (const key of Object.keys(mockData)) delete mockData[key]
    flushConfigWrites() // drain any pending state from a previous test
    storeSet.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defers the disk write until the flush delay elapses', () => {
    deferredConfig.set('activeTabId', 'tab-1')
    expect(storeSet).not.toHaveBeenCalled()

    vi.advanceTimersByTime(600)
    expect(storeSet).toHaveBeenCalledTimes(1)
    expect(mockData.activeTabId).toBe('tab-1')
  })

  it('coalesces multiple mutations into a single write with latest values', () => {
    deferredConfig.set('activeTabId', 'tab-1')
    deferredConfig.set('tabs', [{ id: 'a' }])
    deferredConfig.set('activeTabId', 'tab-2')

    vi.advanceTimersByTime(600)
    expect(storeSet).toHaveBeenCalledTimes(1)
    expect(mockData.activeTabId).toBe('tab-2')
    expect(mockData.tabs).toEqual([{ id: 'a' }])
  })

  it('get returns pending values before they are flushed', () => {
    deferredConfig.set('activeTabId', 'tab-9')
    expect(deferredConfig.get('activeTabId', 'default')).toBe('tab-9')
    expect(storeSet).not.toHaveBeenCalled()
  })

  it('get flushes when a pending dotted key overlaps the requested root', () => {
    deferredConfig.set('preferences.theme', 'light')
    // Reading the whole preferences object must see the dotted write
    deferredConfig.get('preferences', {})
    expect(storeSet).toHaveBeenCalledTimes(1)
    expect(mockData['preferences.theme']).toBe('light')
  })

  it('flushConfigWrites persists pending mutations immediately', () => {
    deferredConfig.set('activeTabId', 'tab-q')
    flushConfigWrites()
    expect(storeSet).toHaveBeenCalledTimes(1)
    expect(mockData.activeTabId).toBe('tab-q')

    // Nothing left pending — timer firing later must not double-write
    vi.advanceTimersByTime(600)
    expect(storeSet).toHaveBeenCalledTimes(1)
  })
})
