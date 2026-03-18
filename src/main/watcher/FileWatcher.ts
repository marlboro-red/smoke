import * as fs from 'fs'
import * as path from 'path'
import type { BrowserWindow } from 'electron'
import { assertWithinAny } from '../ipc/pathBoundary'

const DEBOUNCE_MS = 300

interface WatchEntry {
  watcher: fs.FSWatcher
  debounceTimer: ReturnType<typeof setTimeout> | null
}

export class FileWatcher {
  private watchers = new Map<string, WatchEntry>()
  private getWindow: () => BrowserWindow | null
  private getAllowedBoundaries: (() => string[]) | null

  constructor(
    getWindow: () => BrowserWindow | null,
    getAllowedBoundaries?: () => string[],
  ) {
    this.getWindow = getWindow
    this.getAllowedBoundaries = getAllowedBoundaries ?? null
  }

  async watch(filePath: string): Promise<{ success: boolean; error?: string }> {
    const resolved = path.resolve(filePath)
    if (this.watchers.has(resolved)) return { success: true }

    // Defense-in-depth: reject paths outside allowed directories
    if (this.getAllowedBoundaries) {
      try {
        await assertWithinAny(resolved, this.getAllowedBoundaries())
      } catch {
        const message = 'Access denied: path must be within an allowed directory'
        console.warn(`[FileWatcher] ${message}: ${resolved}`)
        return { success: false, error: message }
      }
    }

    try {
      const watcher = fs.watch(resolved, { persistent: false }, (eventType) => {
        if (eventType !== 'change') return
        const entry = this.watchers.get(resolved)
        if (!entry) return

        // Debounce rapid successive changes (e.g. editors that write + rename)
        if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
        entry.debounceTimer = setTimeout(() => {
          entry.debounceTimer = null
          const win = this.getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('fs:file-changed', { path: resolved })
          }
        }, DEBOUNCE_MS)
      })

      watcher.on('error', (err) => {
        console.warn(`[FileWatcher] Watcher error for ${resolved}:`, err)
        this.unwatch(resolved)
      })

      this.watchers.set(resolved, { watcher, debounceTimer: null })
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[FileWatcher] Failed to watch ${resolved}:`, message)
      return { success: false, error: message }
    }
  }

  unwatch(filePath: string): void {
    const resolved = path.resolve(filePath)
    const entry = this.watchers.get(resolved)
    if (!entry) return

    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    entry.watcher.close()
    this.watchers.delete(resolved)
  }

  dispose(): void {
    for (const [, entry] of this.watchers) {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
      entry.watcher.close()
    }
    this.watchers.clear()
  }
}
