import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock node-pty
const mockPty = {
  pid: 1234,
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(),
  onExit: vi.fn(),
}

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPty),
}))

// Mock fs — existsSync is the only gate for shell resolution now
vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => {
    if (p === '/nonexistent') return false
    if (p.startsWith('/bad/')) return false
    return true
  }),
}))

vi.mock('os', () => ({
  homedir: () => '/home/testuser',
}))

import { PtyProcess } from '../PtyProcess'
import { spawn as ptySpawn } from 'node-pty'

describe('PtyProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset onData/onExit callbacks
    mockPty.onData.mockImplementation(() => {})
    mockPty.onExit.mockImplementation(() => {})
  })

  describe('constructor', () => {
    it('spawns a PTY process with given options', () => {
      const pty = new PtyProcess({
        id: 'test-1',
        cwd: '/home/user',
        cols: 120,
        rows: 40,
      })

      expect(pty.id).toBe('test-1')
      expect(pty.pid).toBe(1234)
      expect(ptySpawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 120,
          rows: 40,
          cwd: '/home/user',
        })
      )
    })

    it('defaults to 80x24 when cols/rows not specified', () => {
      new PtyProcess({ id: 'test-2', cwd: '/tmp' })

      expect(ptySpawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({ cols: 80, rows: 24 })
      )
    })

    it('falls back to homedir when cwd does not exist', () => {
      new PtyProcess({ id: 'test-3', cwd: '/nonexistent' })

      expect(ptySpawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({ cwd: '/home/testuser' })
      )
    })

    it('uses requested shell when it is executable', () => {
      new PtyProcess({ id: 'test-4', cwd: '/tmp', shell: '/usr/bin/zsh' })

      expect(ptySpawn).toHaveBeenCalledWith(
        '/usr/bin/zsh',
        [],
        expect.any(Object)
      )
    })

    it('falls back to default shell when requested shell is not executable', () => {
      new PtyProcess({ id: 'test-5', cwd: '/tmp', shell: '/bad/shell' })

      // Should use getDefaultShell() result, not the bad shell
      const calledShell = (ptySpawn as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(calledShell).not.toBe('/bad/shell')
    })

    it('resolves bare shell name via PATH (e.g. nu.exe)', () => {
      // Simulate a PATH containing a directory with nu.exe
      const origPath = process.env.PATH
      process.env.PATH = '/test-bin' + (process.platform === 'win32' ? ';' : ':') + (origPath || '')
      try {
        new PtyProcess({ id: 'test-path-resolve', cwd: '/tmp', shell: 'nu.exe' })

        // existsSync mock returns true for /test-bin/nu.exe, so it should
        // resolve to the full path instead of falling back to default shell
        const calledShell = (ptySpawn as ReturnType<typeof vi.fn>).mock.calls[0][0]
        expect(calledShell).toContain('nu.exe')
      } finally {
        process.env.PATH = origPath
      }
    })

    it('passes custom args to PTY', () => {
      new PtyProcess({ id: 'test-6', cwd: '/tmp', args: ['--login'] })

      expect(ptySpawn).toHaveBeenCalledWith(
        expect.any(String),
        ['--login'],
        expect.any(Object)
      )
    })

    it('merges custom env with process.env', () => {
      new PtyProcess({ id: 'test-7', cwd: '/tmp', env: { FOO: 'bar' } })

      const envArg = (ptySpawn as ReturnType<typeof vi.fn>).mock.calls[0][2].env
      expect(envArg.FOO).toBe('bar')
    })

    it('emits data events from PTY', () => {
      let dataCallback: ((data: string) => void) | undefined
      mockPty.onData.mockImplementation((cb: (data: string) => void) => {
        dataCallback = cb
      })

      const pty = new PtyProcess({ id: 'test-8', cwd: '/tmp' })
      const listener = vi.fn()
      pty.on('data', listener)

      dataCallback?.('hello')
      expect(listener).toHaveBeenCalledWith('hello')
    })

    it('emits exit events from PTY and sets exited flag', () => {
      let exitCallback: ((info: { exitCode: number; signal?: number }) => void) | undefined
      mockPty.onExit.mockImplementation((cb: (info: { exitCode: number; signal?: number }) => void) => {
        exitCallback = cb
      })

      const pty = new PtyProcess({ id: 'test-9', cwd: '/tmp' })
      const listener = vi.fn()
      pty.on('exit', listener)

      exitCallback?.({ exitCode: 0, signal: undefined })
      expect(listener).toHaveBeenCalledWith(0, undefined)
    })
  })

  describe('write', () => {
    it('writes data to the PTY', () => {
      const pty = new PtyProcess({ id: 'test-w1', cwd: '/tmp' })
      pty.write('ls\n')
      expect(mockPty.write).toHaveBeenCalledWith('ls\n')
    })

    it('does nothing after exit', () => {
      let exitCallback: ((info: { exitCode: number; signal?: number }) => void) | undefined
      mockPty.onExit.mockImplementation((cb: (info: { exitCode: number; signal?: number }) => void) => {
        exitCallback = cb
      })

      const pty = new PtyProcess({ id: 'test-w2', cwd: '/tmp' })
      exitCallback?.({ exitCode: 0 })
      mockPty.write.mockClear()

      pty.write('ls\n')
      expect(mockPty.write).not.toHaveBeenCalled()
    })
  })

  describe('resize', () => {
    it('resizes the PTY', () => {
      const pty = new PtyProcess({ id: 'test-r1', cwd: '/tmp' })
      pty.resize(100, 50)
      expect(mockPty.resize).toHaveBeenCalledWith(100, 50)
    })

    it('does nothing after exit', () => {
      let exitCallback: ((info: { exitCode: number; signal?: number }) => void) | undefined
      mockPty.onExit.mockImplementation((cb: (info: { exitCode: number; signal?: number }) => void) => {
        exitCallback = cb
      })

      const pty = new PtyProcess({ id: 'test-r2', cwd: '/tmp' })
      exitCallback?.({ exitCode: 0 })
      mockPty.resize.mockClear()

      pty.resize(100, 50)
      expect(mockPty.resize).not.toHaveBeenCalled()
    })
  })

  describe('kill', () => {
    it('kills the PTY', () => {
      const pty = new PtyProcess({ id: 'test-k1', cwd: '/tmp' })
      pty.kill()
      expect(mockPty.kill).toHaveBeenCalled()
    })

    it('does nothing after exit', () => {
      let exitCallback: ((info: { exitCode: number; signal?: number }) => void) | undefined
      mockPty.onExit.mockImplementation((cb: (info: { exitCode: number; signal?: number }) => void) => {
        exitCallback = cb
      })

      const pty = new PtyProcess({ id: 'test-k2', cwd: '/tmp' })
      exitCallback?.({ exitCode: 0 })
      mockPty.kill.mockClear()

      pty.kill()
      expect(mockPty.kill).not.toHaveBeenCalled()
    })
  })
})
