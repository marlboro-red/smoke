import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// Use vi.hoisted to ensure the mock class is available when vi.mock runs
const { MockPtyProcess, instanceTracker } = vi.hoisted(() => {
  const { EventEmitter } = require('events')
  let instanceCount = 0
  const instances: any[] = []

  class MockPtyProcess extends EventEmitter {
    id: string
    pid: number

    constructor(options: { id: string; cwd: string }) {
      super()
      this.id = options.id
      this.pid = 1000 + instanceCount++
      instances.push(this)
    }

    write = vi.fn()
    resize = vi.fn()
    kill = vi.fn(function (this: any) {
      this.emit('exit', 0, undefined)
    })

    simulateExit(code = 0) {
      this.emit('exit', code, undefined)
    }
  }

  return {
    MockPtyProcess,
    instanceTracker: { count: () => instanceCount, reset: () => { instanceCount = 0; instances.length = 0 }, instances },
  }
})

vi.mock('../PtyProcess', () => ({
  PtyProcess: MockPtyProcess,
}))

import { PtyManager } from '../PtyManager'

describe('PtyManager', () => {
  let manager: PtyManager

  beforeEach(() => {
    manager = new PtyManager()
    instanceTracker.reset()
  })

  describe('spawn', () => {
    it('creates a new PTY process and stores it', () => {
      const pty = manager.spawn({ id: 'sess-1', cwd: '/tmp' })
      expect(pty.id).toBe('sess-1')
      expect(manager.get('sess-1')).toBe(pty)
    })

    it('manages multiple processes', () => {
      const pty1 = manager.spawn({ id: 'sess-1', cwd: '/a' })
      const pty2 = manager.spawn({ id: 'sess-2', cwd: '/b' })
      expect(manager.get('sess-1')).toBe(pty1)
      expect(manager.get('sess-2')).toBe(pty2)
    })

    it('auto-removes process on exit', () => {
      const pty = manager.spawn({ id: 'sess-1', cwd: '/tmp' })
      expect(manager.get('sess-1')).toBeDefined()

      ;(pty as any).simulateExit(0)
      expect(manager.get('sess-1')).toBeUndefined()
    })
  })

  describe('get', () => {
    it('returns undefined for unknown id', () => {
      expect(manager.get('nonexistent')).toBeUndefined()
    })
  })

  describe('write', () => {
    it('delegates to the correct process', () => {
      const pty = manager.spawn({ id: 'sess-1', cwd: '/tmp' })
      manager.write('sess-1', 'hello')
      expect(pty.write).toHaveBeenCalledWith('hello')
    })

    it('does nothing for unknown id', () => {
      manager.write('nonexistent', 'hello')
    })
  })

  describe('resize', () => {
    it('delegates to the correct process', () => {
      const pty = manager.spawn({ id: 'sess-1', cwd: '/tmp' })
      manager.resize('sess-1', 120, 40)
      expect(pty.resize).toHaveBeenCalledWith(120, 40)
    })

    it('does nothing for unknown id', () => {
      manager.resize('nonexistent', 80, 24)
    })
  })

  describe('kill', () => {
    it('delegates to the correct process', () => {
      const pty = manager.spawn({ id: 'sess-1', cwd: '/tmp' })
      manager.kill('sess-1')
      expect(pty.kill).toHaveBeenCalled()
    })

    it('does nothing for unknown id', () => {
      manager.kill('nonexistent')
    })
  })

  describe('killAll', () => {
    it('kills all processes and clears the map', () => {
      const pty1 = manager.spawn({ id: 'sess-1', cwd: '/a' })
      const pty2 = manager.spawn({ id: 'sess-2', cwd: '/b' })

      manager.killAll()

      expect(pty1.kill).toHaveBeenCalled()
      expect(pty2.kill).toHaveBeenCalled()
      expect(manager.get('sess-1')).toBeUndefined()
      expect(manager.get('sess-2')).toBeUndefined()
    })
  })
})
