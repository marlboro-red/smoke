import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import type { BrowserWindow } from 'electron'

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.go',
  '.rs',
  '.java', '.kt', '.kts',
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.scala',
  '.vue', '.svelte',
  '.lua',
  '.zig',
  '.ex', '.exs',
  '.hs',
  '.ml', '.mli',
  '.r', '.R',
  '.jl',
  '.dart',
  '.elm',
  '.clj', '.cljs', '.cljc',
  '.erl', '.hrl',
])

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn',
  'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'env',
  'target', 'vendor', '.cache',
  'coverage', '.nyc_output',
])

const DEBOUNCE_MS = 500
/** Flush immediately when pending updates exceed this count (burst protection). */
const BURST_LIMIT = 50

export class FilenameIndex {
  private index = new Map<string, string[]>()
  private rootPath: string | null = null
  private watcher: fs.FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingAdds = new Set<string>()
  private pendingDeletes = new Set<string>()
  private lastNotifyTime = 0
  private getWindow: () => BrowserWindow | null
  private building = false

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow
  }

  async build(rootPath: string): Promise<{ fileCount: number; basenameCount: number }> {
    this.dispose()
    this.rootPath = path.resolve(rootPath)
    this.building = true

    try {
      await this.scanDirectory(this.rootPath)
    } finally {
      this.building = false
    }

    this.startWatching()

    return {
      fileCount: this.totalFiles(),
      basenameCount: this.index.size,
    }
  }

  lookup(basename: string): string[] {
    return this.index.get(basename) ?? []
  }

  getStats(): { fileCount: number; basenameCount: number; rootPath: string | null } {
    return {
      fileCount: this.totalFiles(),
      basenameCount: this.index.size,
      rootPath: this.rootPath,
    }
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.index.clear()
    this.pendingAdds.clear()
    this.pendingDeletes.clear()
    this.rootPath = null
  }

  private async scanDirectory(dirPath: string): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    const subdirPromises: Promise<void>[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          subdirPromises.push(this.scanDirectory(path.join(dirPath, entry.name)))
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SOURCE_EXTENSIONS.has(ext)) {
          this.addFile(path.join(dirPath, entry.name))
        }
      }
    }

    await Promise.all(subdirPromises)
  }

  private addFile(fullPath: string): void {
    const basename = path.basename(fullPath)
    const existing = this.index.get(basename)
    if (existing) {
      if (!existing.includes(fullPath)) {
        existing.push(fullPath)
      }
    } else {
      this.index.set(basename, [fullPath])
    }
  }

  private removeFile(fullPath: string): void {
    const basename = path.basename(fullPath)
    const existing = this.index.get(basename)
    if (!existing) return

    const idx = existing.indexOf(fullPath)
    if (idx !== -1) {
      existing.splice(idx, 1)
      if (existing.length === 0) {
        this.index.delete(basename)
      }
    }
  }

  private startWatching(): void {
    if (!this.rootPath) return

    try {
      this.watcher = fs.watch(
        this.rootPath,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          if (!filename || !this.rootPath) return

          const ext = path.extname(filename).toLowerCase()
          if (!SOURCE_EXTENSIONS.has(ext)) return

          // Check if any path segment is in IGNORE_DIRS
          const parts = filename.split(path.sep)
          if (parts.some((p) => IGNORE_DIRS.has(p))) return

          const fullPath = path.join(this.rootPath, filename)
          this.scheduleUpdate(fullPath)
        }
      )

      this.watcher.on('error', () => {
        // Watcher may fail if the directory is deleted
        if (this.watcher) {
          this.watcher.close()
          this.watcher = null
        }
      })
    } catch {
      // Directory may not support watching
    }
  }

  private scheduleUpdate(fullPath: string): void {
    // Check if file exists to determine add vs delete
    fs.access(fullPath, fs.constants.F_OK, (err) => {
      if (err) {
        this.pendingDeletes.add(fullPath)
        this.pendingAdds.delete(fullPath)
      } else {
        this.pendingAdds.add(fullPath)
        this.pendingDeletes.delete(fullPath)
      }

      // Burst protection: flush immediately when queue is full
      if (this.pendingAdds.size + this.pendingDeletes.size >= BURST_LIMIT) {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer)
          this.debounceTimer = null
        }
        this.flushPending()
        return
      }

      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null
        this.flushPending()
      }, DEBOUNCE_MS)
    })
  }

  private flushPending(): void {
    let changed = false

    for (const fullPath of this.pendingDeletes) {
      this.removeFile(fullPath)
      changed = true
    }
    this.pendingDeletes.clear()

    for (const fullPath of this.pendingAdds) {
      this.addFile(fullPath)
      changed = true
    }
    this.pendingAdds.clear()

    if (changed) {
      this.notifyUpdated()
    }
  }

  private notifyUpdated(): void {
    const now = Date.now()
    if (now - this.lastNotifyTime < DEBOUNCE_MS) return
    this.lastNotifyTime = now

    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('project:index-updated', {
        fileCount: this.totalFiles(),
        basenameCount: this.index.size,
      })
    }
  }

  private totalFiles(): number {
    let count = 0
    for (const paths of this.index.values()) {
      count += paths.length
    }
    return count
  }
}
