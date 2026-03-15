/**
 * Project-wide reverse dependency index (smoke-mib.10).
 *
 * Scans all source files, parses imports, resolves them, and builds
 * a Map<filepath, Set<filepath>> where key = imported file, value = files
 * that import it. Reads only the first 4KB of each file.
 * Updates incrementally via file watcher.
 */

import * as fs from 'fs/promises'
import { parseImports, detectLanguage } from './importParser'
import { resolveAllImports, type PathAliases } from './importResolver'
import type { FilenameIndex } from './FilenameIndex'

const FILE_READ_LIMIT = 4096

export class ReverseIndex {
  /** target file → set of files that import it */
  private reverseMap = new Map<string, Set<string>>()
  /** source file → set of files it imports (for incremental updates) */
  private forwardMap = new Map<string, Set<string>>()

  private buildPromise: Promise<void> | null = null
  private built = false

  /**
   * Build the reverse index by scanning all indexed files.
   * Returns a promise that resolves when the scan is complete.
   * Safe to call multiple times — deduplicates concurrent builds.
   */
  build(
    index: FilenameIndex,
    aliases: PathAliases,
  ): Promise<void> {
    if (this.built) return Promise.resolve()
    if (this.buildPromise) return this.buildPromise

    this.buildPromise = this.doBuild(index, aliases)
    return this.buildPromise
  }

  /** Whether the index has finished building. */
  get isBuilt(): boolean {
    return this.built
  }

  /** Get all files that import the given file. */
  getDependents(filePath: string): string[] {
    const set = this.reverseMap.get(filePath)
    return set ? Array.from(set) : []
  }

  /**
   * Incrementally update when a file changes.
   * Re-parses the file and updates forward + reverse maps.
   */
  async updateFile(
    filePath: string,
    index: FilenameIndex,
    aliases: PathAliases,
  ): Promise<void> {
    // Remove old forward entries from reverse map
    const oldImports = this.forwardMap.get(filePath)
    if (oldImports) {
      for (const target of oldImports) {
        this.reverseMap.get(target)?.delete(filePath)
      }
    }

    // Re-scan the file
    const imports = await this.scanFile(filePath, index, aliases)
    if (imports) {
      this.forwardMap.set(filePath, imports)
      for (const target of imports) {
        if (!this.reverseMap.has(target)) {
          this.reverseMap.set(target, new Set())
        }
        this.reverseMap.get(target)!.add(filePath)
      }
    } else {
      this.forwardMap.delete(filePath)
    }
  }

  /** Remove a file from the index entirely. */
  removeFile(filePath: string): void {
    // Remove from reverse map (as an importer)
    const oldImports = this.forwardMap.get(filePath)
    if (oldImports) {
      for (const target of oldImports) {
        this.reverseMap.get(target)?.delete(filePath)
      }
    }
    this.forwardMap.delete(filePath)

    // Remove as a target
    this.reverseMap.delete(filePath)
  }

  /** Reset the index. */
  invalidate(): void {
    this.reverseMap.clear()
    this.forwardMap.clear()
    this.built = false
    this.buildPromise = null
  }

  // -- Internal --

  private async doBuild(
    index: FilenameIndex,
    aliases: PathAliases,
  ): Promise<void> {
    this.reverseMap.clear()
    this.forwardMap.clear()

    // Get all indexed file paths via the FilenameIndex
    // We need to iterate all paths — use lookup on all known basenames
    const allPaths = this.getAllPaths(index)

    // Process in batches to avoid blocking the event loop
    const BATCH_SIZE = 100
    for (let i = 0; i < allPaths.length; i += BATCH_SIZE) {
      const batch = allPaths.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map((filePath) => this.processFile(filePath, index, aliases)),
      )
      // Yield to event loop between batches
      if (i + BATCH_SIZE < allPaths.length) {
        await new Promise<void>((r) => setImmediate(r))
      }
    }

    this.built = true
    this.buildPromise = null
  }

  private async processFile(
    filePath: string,
    index: FilenameIndex,
    aliases: PathAliases,
  ): Promise<void> {
    const imports = await this.scanFile(filePath, index, aliases)
    if (!imports) return

    this.forwardMap.set(filePath, imports)
    for (const target of imports) {
      if (!this.reverseMap.has(target)) {
        this.reverseMap.set(target, new Set())
      }
      this.reverseMap.get(target)!.add(filePath)
    }
  }

  private async scanFile(
    filePath: string,
    index: FilenameIndex,
    aliases: PathAliases,
  ): Promise<Set<string> | null> {
    try {
      const fd = await fs.open(filePath, 'r')
      try {
        const buf = Buffer.alloc(FILE_READ_LIMIT)
        const { bytesRead } = await fd.read(buf, 0, FILE_READ_LIMIT, 0)
        const content = buf.toString('utf-8', 0, bytesRead)

        const language = detectLanguage(filePath)
        if (language === 'text') return null

        const parsed = parseImports(content, language)
        const resolved = resolveAllImports(parsed, filePath, language, index, aliases)

        const importSet = new Set<string>()
        for (const imp of resolved) {
          if (imp.resolvedPath) {
            importSet.add(imp.resolvedPath)
          }
        }
        return importSet.size > 0 ? importSet : null
      } finally {
        await fd.close()
      }
    } catch {
      return null
    }
  }

  private getAllPaths(index: FilenameIndex): string[] {
    return Array.from(index.paths)
  }
}
