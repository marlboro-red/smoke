import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { FileWatcher } from '../FileWatcher'

describe('FileWatcher', () => {
  let tmpDir: string
  let mockWindow: any
  let getWindow: () => any

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'smoke-fw-test-'))
    mockWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn(),
      },
    }
    getWindow = () => mockWindow
  })

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  describe('watch / unwatch', () => {
    it('registers a watcher for a file', async () => {
      const filePath = path.join(tmpDir, 'test.txt')
      await fsp.writeFile(filePath, 'initial')

      const watcher = new FileWatcher(getWindow)
      watcher.watch(filePath)

      // Trigger a change and wait for debounced notification
      await fsp.writeFile(filePath, 'changed')
      await new Promise((r) => setTimeout(r, 500))

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'fs:file-changed',
        { path: path.resolve(filePath) }
      )

      watcher.dispose()
    })

    it('does not duplicate watchers for the same path', async () => {
      const filePath = path.join(tmpDir, 'dup.txt')
      await fsp.writeFile(filePath, 'data')

      const watcher = new FileWatcher(getWindow)
      watcher.watch(filePath)
      watcher.watch(filePath) // second call should be a no-op

      await fsp.writeFile(filePath, 'changed')
      await new Promise((r) => setTimeout(r, 500))

      // Should only fire once, not twice
      const calls = mockWindow.webContents.send.mock.calls.filter(
        (c: any[]) => c[0] === 'fs:file-changed'
      )
      expect(calls.length).toBeLessThanOrEqual(1)

      watcher.dispose()
    })

    it('stops watching after unwatch', async () => {
      const filePath = path.join(tmpDir, 'unwatch.txt')
      await fsp.writeFile(filePath, 'initial')

      const watcher = new FileWatcher(getWindow)
      watcher.watch(filePath)
      watcher.unwatch(filePath)

      await fsp.writeFile(filePath, 'changed')
      await new Promise((r) => setTimeout(r, 500))

      expect(mockWindow.webContents.send).not.toHaveBeenCalled()

      watcher.dispose()
    })

    it('unwatch on unwatched path is a no-op', () => {
      const watcher = new FileWatcher(getWindow)
      // Should not throw
      watcher.unwatch('/nonexistent/path.txt')
      watcher.dispose()
    })

    it('silently ignores watch on nonexistent file', () => {
      const watcher = new FileWatcher(getWindow)
      // Should not throw
      watcher.watch(path.join(tmpDir, 'no-such-file.txt'))
      watcher.dispose()
    })
  })

  describe('dispose', () => {
    it('closes all active watchers', async () => {
      const file1 = path.join(tmpDir, 'a.txt')
      const file2 = path.join(tmpDir, 'b.txt')
      await fsp.writeFile(file1, 'a')
      await fsp.writeFile(file2, 'b')

      const watcher = new FileWatcher(getWindow)
      watcher.watch(file1)
      watcher.watch(file2)

      watcher.dispose()

      // After dispose, changes should not trigger notifications
      await fsp.writeFile(file1, 'a2')
      await fsp.writeFile(file2, 'b2')
      await new Promise((r) => setTimeout(r, 500))

      expect(mockWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('can be called multiple times safely', async () => {
      const filePath = path.join(tmpDir, 'multi.txt')
      await fsp.writeFile(filePath, 'data')

      const watcher = new FileWatcher(getWindow)
      watcher.watch(filePath)

      watcher.dispose()
      // Second dispose should not throw
      watcher.dispose()
    })

    it('clears pending debounce timers', async () => {
      const filePath = path.join(tmpDir, 'debounce.txt')
      await fsp.writeFile(filePath, 'initial')

      const watcher = new FileWatcher(getWindow)
      watcher.watch(filePath)

      // Trigger change but immediately dispose before debounce fires
      await fsp.writeFile(filePath, 'changed')
      watcher.dispose()

      // Wait past the debounce window
      await new Promise((r) => setTimeout(r, 500))

      expect(mockWindow.webContents.send).not.toHaveBeenCalled()
    })
  })
})
