import * as fs from 'fs'
import * as path from 'path'
import type { BrowserWindow } from 'electron'

const DEBOUNCE_MS = 300

interface WatchEntry {
  watcher: fs.FSWatcher
  debounceTimer: ReturnType<typeof setTimeout> | null
}

export class FileWatcher {
  private watchers = new Map<string, WatchEntry>()
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  watch(filePath: string): void {
    const resolved = path.resolve(filePath)
    if (this.watchers.has(resolved)) return

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
    } catch (err) {
      console.warn(`[FileWatcher] Failed to watch ${resolved}:`, err)
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
