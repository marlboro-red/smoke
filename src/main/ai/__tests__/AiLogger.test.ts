import { describe, it, expect, beforeEach, vi } from 'vitest'

// AiLogger uses a singleton — re-import fresh for each test via resetModules
let aiLogger: typeof import('../AiLogger').aiLogger

beforeEach(async () => {
  vi.resetModules()
  const mod = await import('../AiLogger')
  aiLogger = mod.aiLogger
  aiLogger.clear()
})

describe('AiLogger', () => {
  it('logs entries and retrieves them', () => {
    aiLogger.info('agent', 'Created agent', { agentId: 'a1' })
    aiLogger.warn('ipc', 'Slow response', { agentId: 'a1', meta: { durationMs: 5000 } })

    const entries = aiLogger.getEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0].level).toBe('info')
    expect(entries[0].category).toBe('agent')
    expect(entries[0].message).toBe('Created agent')
    expect(entries[0].agentId).toBe('a1')
    expect(entries[1].level).toBe('warn')
  })

  it('filters by category', () => {
    aiLogger.info('agent', 'Agent created')
    aiLogger.info('ipc', 'IPC call')
    aiLogger.error('subprocess', 'Crash')

    expect(aiLogger.getEntries({ category: 'ipc' })).toHaveLength(1)
    expect(aiLogger.getEntries({ category: 'agent' })).toHaveLength(1)
    expect(aiLogger.getEntries({ category: 'subprocess' })).toHaveLength(1)
  })

  it('filters by agentId', () => {
    aiLogger.info('agent', 'A1 event', { agentId: 'a1' })
    aiLogger.info('agent', 'A2 event', { agentId: 'a2' })
    aiLogger.info('agent', 'A1 again', { agentId: 'a1' })

    expect(aiLogger.getEntries({ agentId: 'a1' })).toHaveLength(2)
    expect(aiLogger.getEntries({ agentId: 'a2' })).toHaveLength(1)
  })

  it('filters by level', () => {
    aiLogger.debug('stream', 'Debug msg')
    aiLogger.info('stream', 'Info msg')
    aiLogger.error('stream', 'Error msg')

    expect(aiLogger.getEntries({ level: 'error' })).toHaveLength(1)
    expect(aiLogger.getEntries({ level: 'debug' })).toHaveLength(1)
  })

  it('filters by since timestamp', () => {
    aiLogger.info('agent', 'Old entry')
    const midpoint = Date.now()
    aiLogger.info('agent', 'New entry')

    const recent = aiLogger.getEntries({ since: midpoint })
    expect(recent.length).toBeGreaterThanOrEqual(1)
    expect(recent.every((e) => e.timestamp >= midpoint)).toBe(true)
  })

  it('respects limit', () => {
    for (let i = 0; i < 10; i++) {
      aiLogger.info('agent', `Entry ${i}`)
    }

    const limited = aiLogger.getEntries({ limit: 3 })
    expect(limited).toHaveLength(3)
    // Should return the most recent entries
    expect(limited[2].message).toBe('Entry 9')
  })

  it('caps buffer at MAX_ENTRIES', () => {
    for (let i = 0; i < 1100; i++) {
      aiLogger.debug('stream', `Event ${i}`)
    }

    expect(aiLogger.size).toBeLessThanOrEqual(1000)
  })

  it('clear() empties the buffer', () => {
    aiLogger.info('agent', 'Entry')
    expect(aiLogger.size).toBe(1)
    aiLogger.clear()
    expect(aiLogger.size).toBe(0)
    expect(aiLogger.getEntries()).toHaveLength(0)
  })

  it('stores meta and conversationId', () => {
    aiLogger.info('tool', 'Tool call', {
      agentId: 'a1',
      conversationId: 'c1',
      meta: { toolName: 'spawn_terminal', durationMs: 42 },
    })

    const entries = aiLogger.getEntries()
    expect(entries[0].conversationId).toBe('c1')
    expect(entries[0].meta).toEqual({ toolName: 'spawn_terminal', durationMs: 42 })
  })

  it('writes to console at correct levels', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    aiLogger.debug('stream', 'Debug')
    aiLogger.info('agent', 'Info')
    aiLogger.warn('ipc', 'Warn')
    aiLogger.error('subprocess', 'Error')

    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    debugSpy.mockRestore()
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
