/**
 * Project-wide filepath index for fast import resolution (smoke-mib.2).
 *
 * Globs all source files and builds a Map<basename, fullpath[]> for O(1) lookup.
 * Supports incremental updates via file watcher events.
 */

import * as fs from 'fs/promises'
import * as path from 'path'

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs',
])

/** Directories to always skip when indexing. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', '.next',
  '__pycache__', '.tox', 'venv', '.venv', 'target',
])

export class FilenameIndex {
  /** basename (with ext) → Set of absolute paths */
  private index = new Map<string, Set<string>>()
  /** All indexed file paths for iteration */
  private allPaths = new Set<string>()
  private projectRoot: string = ''

  /** Build the index by walking the project directory. */
  async build(projectRoot: string): Promise<void> {
    this.projectRoot = projectRoot
    this.index.clear()
    this.allPaths.clear()
    await this.walkDir(projectRoot)
  }

  /** Lookup all absolute paths matching a given basename. */
  lookup(basename: string): string[] {
    return Array.from(this.index.get(basename) ?? [])
  }

  /** Check if a specific absolute path is in the index. */
  has(absolutePath: string): boolean {
    return this.allPaths.has(absolutePath)
  }

  /** Get total number of indexed files. */
  get size(): number {
    return this.allPaths.size
  }

  /** Get the project root this index was built for. */
  get root(): string {
    return this.projectRoot
  }

  /** Iterate all indexed file paths. */
  get paths(): ReadonlySet<string> {
    return this.allPaths
  }

  // -- Incremental updates --

  /** Add a file to the index (e.g., on file create/rename). */
  addFile(absolutePath: string): void {
    const ext = path.extname(absolutePath).toLowerCase()
    if (!SOURCE_EXTENSIONS.has(ext)) return

    const basename = path.basename(absolutePath)
    if (!this.index.has(basename)) {
      this.index.set(basename, new Set())
    }
    this.index.get(basename)!.add(absolutePath)
    this.allPaths.add(absolutePath)
  }

  /** Remove a file from the index (e.g., on file delete/rename). */
  removeFile(absolutePath: string): void {
    const basename = path.basename(absolutePath)
    const set = this.index.get(basename)
    if (set) {
      set.delete(absolutePath)
      if (set.size === 0) this.index.delete(basename)
    }
    this.allPaths.delete(absolutePath)
  }

  // -- Internal --

  private async walkDir(dir: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (err) {
      console.warn(`[FilenameIndex] Failed to read directory ${dir}:`, err)
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await this.walkDir(fullPath)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SOURCE_EXTENSIONS.has(ext)) {
          const basename = entry.name
          if (!this.index.has(basename)) {
            this.index.set(basename, new Set())
          }
          this.index.get(basename)!.add(fullPath)
          this.allPaths.add(fullPath)
        }
      }
    }
  }
}
