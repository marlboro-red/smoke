import { describe, it, expect, beforeEach, vi } from 'vitest'
import { taskInputStore } from '../taskInputStore'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Mock window.smokeAPI
const mockCollect = vi.fn()
const mockDispatchEvent = vi.fn()
Object.defineProperty(globalThis, 'window', {
  value: {
    smokeAPI: {
      context: { collect: mockCollect },
    },
    dispatchEvent: mockDispatchEvent,
    CustomEvent: class {
      type: string
      detail: unknown
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    },
  },
  writable: true,
})

// Mock preferencesStore
vi.mock('../../stores/preferencesStore', () => ({
  preferencesStore: {
    getState: () => ({
      preferences: {
        defaultCwd: '/project',
        skipAssemblyPreview: false,
      },
      launchCwd: '/project',
    }),
  },
}))

// Mock assemblyPreviewStore
const mockShowPreview = vi.fn()
vi.mock('../assemblyPreviewStore', () => ({
  assemblyPreviewStore: {
    getState: () => ({
      showPreview: mockShowPreview,
    }),
  },
}))

describe('taskInputStore', () => {
  beforeEach(() => {
    taskInputStore.getState().close()
    taskInputStore.getState().clearHistory()
    localStorageMock.clear()
    mockCollect.mockReset()
    mockShowPreview.mockReset()
    mockDispatchEvent.mockReset()
  })

  it('starts closed with empty query', () => {
    const state = taskInputStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.query).toBe('')
    expect(state.loading).toBe(false)
    expect(state.phase).toBeNull()
  })

  it('open sets isOpen to true and resets query', () => {
    taskInputStore.getState().setQuery('something')
    taskInputStore.getState().open()

    const state = taskInputStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.query).toBe('')
    expect(state.loading).toBe(false)
  })

  it('close resets all state', () => {
    taskInputStore.getState().open()
    taskInputStore.getState().setQuery('test')
    taskInputStore.getState().close()

    const state = taskInputStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.query).toBe('')
    expect(state.loading).toBe(false)
    expect(state.phase).toBeNull()
  })

  it('setQuery updates the query', () => {
    taskInputStore.getState().setQuery('fix auth')
    expect(taskInputStore.getState().query).toBe('fix auth')
  })

  it('submit does nothing for empty description', async () => {
    await taskInputStore.getState().submit('   ')
    expect(mockCollect).not.toHaveBeenCalled()
  })

  it('submit calls context.collect and opens preview', async () => {
    const result = {
      files: [{ filePath: '/project/src/auth.ts', relevance: 0.85, imports: [], importedBy: [], source: 'search' }],
      parsedTask: { intent: 'fix', keywords: ['auth'], filePatterns: [], includeFileTypes: ['source'], usedAi: false },
      structureMap: null,
      timing: { parse: 1, search: 2, structure: 3, graph: 4, scoring: 5, total: 15 },
    }
    mockCollect.mockResolvedValue(result)

    await taskInputStore.getState().submit('fix auth bug')

    expect(mockCollect).toHaveBeenCalledWith('fix auth bug', '/project', 15)
    expect(mockShowPreview).toHaveBeenCalledWith(result, '/project', 'fix auth bug')

    // Should close after submission
    const state = taskInputStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.loading).toBe(false)
  })

  it('submit adds entry to history', async () => {
    mockCollect.mockResolvedValue({
      files: [],
      parsedTask: { intent: 'fix', keywords: [], filePatterns: [], includeFileTypes: [], usedAi: false },
      structureMap: null,
      timing: { parse: 1, search: 2, structure: 3, graph: 4, scoring: 5, total: 15 },
    })

    await taskInputStore.getState().submit('fix auth')
    expect(taskInputStore.getState().history).toHaveLength(1)
    expect(taskInputStore.getState().history[0].description).toBe('fix auth')
  })

  it('submit deduplicates history entries case-insensitively', async () => {
    mockCollect.mockResolvedValue({
      files: [],
      parsedTask: { intent: 'fix', keywords: [], filePatterns: [], includeFileTypes: [], usedAi: false },
      structureMap: null,
      timing: { parse: 1, search: 2, structure: 3, graph: 4, scoring: 5, total: 15 },
    })

    await taskInputStore.getState().submit('fix auth')
    await taskInputStore.getState().submit('Fix Auth')

    expect(taskInputStore.getState().history).toHaveLength(1)
    expect(taskInputStore.getState().history[0].description).toBe('Fix Auth')
  })

  it('removeHistoryEntry removes by timestamp', async () => {
    mockCollect.mockResolvedValue({
      files: [],
      parsedTask: { intent: 'fix', keywords: [], filePatterns: [], includeFileTypes: [], usedAi: false },
      structureMap: null,
      timing: { parse: 1, search: 2, structure: 3, graph: 4, scoring: 5, total: 15 },
    })

    await taskInputStore.getState().submit('task 1')
    await taskInputStore.getState().submit('task 2')

    const ts = taskInputStore.getState().history[1].timestamp
    taskInputStore.getState().removeHistoryEntry(ts)

    expect(taskInputStore.getState().history).toHaveLength(1)
    expect(taskInputStore.getState().history[0].description).toBe('task 2')
  })

  it('clearHistory removes all entries', async () => {
    mockCollect.mockResolvedValue({
      files: [],
      parsedTask: { intent: 'fix', keywords: [], filePatterns: [], includeFileTypes: [], usedAi: false },
      structureMap: null,
      timing: { parse: 1, search: 2, structure: 3, graph: 4, scoring: 5, total: 15 },
    })

    await taskInputStore.getState().submit('task 1')
    await taskInputStore.getState().submit('task 2')
    taskInputStore.getState().clearHistory()

    expect(taskInputStore.getState().history).toHaveLength(0)
  })

  it('handles collect failure gracefully', async () => {
    mockCollect.mockRejectedValue(new Error('network error'))

    await taskInputStore.getState().submit('fix auth')

    const state = taskInputStore.getState()
    expect(state.loading).toBe(false)
    expect(state.phase).toBeNull()
  })

  it('handles null collect result', async () => {
    mockCollect.mockResolvedValue(null)

    await taskInputStore.getState().submit('fix auth')

    const state = taskInputStore.getState()
    expect(state.loading).toBe(false)
    expect(state.phase).toBeNull()
    expect(mockShowPreview).not.toHaveBeenCalled()
  })
})
