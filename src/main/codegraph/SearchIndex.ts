/**
 * Full-text search index for project source files (smoke-phq.1).
 *
 * Indexes file contents using a word-level inverted index for fast
 * keyword search. Supports querying by keyword, function name, class name,
 * or any string. Returns ranked results with file path, line number, and
 * surrounding context.
 *
 * Initial build runs in a background worker thread to avoid blocking
 * the main process event loop. Incremental updates via file watcher
 * happen on the main thread (single-file reindexing is lightweight).
 */

import * as fsSync from 'fs'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Worker } from 'worker_threads'
import type { BrowserWindow } from 'electron'

/** Extensions to index (source code files only). */
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.kts',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  '.cs', '.rb', '.php', '.swift', '.scala',
  '.vue', '.svelte', '.astro',
  '.css', '.scss', '.less',
  '.html', '.xml', '.yaml', '.yml', '.toml',
  '.json', '.md', '.txt', '.sh', '.bash', '.zsh',
  '.sql', '.graphql', '.gql', '.proto',
])

/** Directories to skip when indexing. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', '.next',
  '__pycache__', '.tox', 'venv', '.venv', 'target',
  '.cache', '.turbo', '.parcel-cache', 'coverage',
  '.DS_Store', '.beads',
])

/** Maximum file size to index (256KB). */
const MAX_FILE_SIZE = 256 * 1024

const WATCHER_DEBOUNCE_MS = 500

export interface SearchResult {
  /** Absolute file path. */
  filePath: string
  /** 1-based line number. */
  lineNumber: number
  /** The matching line content (trimmed). */
  lineContent: string
  /** 0-based start of the match within the line. */
  matchStart: number
  /** 0-based end of the match within the line. */
  matchEnd: number
  /** Relevance score (higher = more relevant). */
  score: number
}

export interface SearchResponse {
  /** Matching results, sorted by score descending. */
  results: SearchResult[]
  /** Total number of matches found (may exceed results.length if capped). */
  totalMatches: number
  /** Time taken in milliseconds. */
  durationMs: number
}

export interface SearchIndexStats {
  /** Number of indexed files. */
  fileCount: number
  /** Number of unique tokens in the index. */
  tokenCount: number
  /** Project root path, or null if not built. */
  rootPath: string | null
  /** Whether indexing is currently in progress. */
  indexing: boolean
}

/** An entry in the inverted index: which file and lines contain a token. */
interface PostingEntry {
  filePath: string
  /** Line numbers (1-based) where the token appears. */
  lines: number[]
}

export class SearchIndex {
  /** Inverted index: lowercase token → posting list. */
  private index = new Map<string, PostingEntry[]>()
  /** File content cache for context retrieval. Lines keyed by absolute path. */
  private fileLines = new Map<string, string[]>()
  /** All indexed file paths. */
  private indexedFiles = new Set<string>()
  private projectRoot: string = ''
  private isIndexing = false
  private worker: Worker | null = null
  private watcher: fsSync.FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingUpdates = new Map<string, 'add' | 'delete'>()
  private getMainWindow: () => BrowserWindow | null

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow
  }

  /**
   * Build the full index for a project.
   * Uses a background worker thread for the heavy I/O and tokenization.
   * Falls back to main-thread indexing if the worker file is unavailable.
   */
  async build(projectRoot: string): Promise<{ fileCount: number; tokenCount: number }> {
    this.dispose()
    this.projectRoot = path.resolve(projectRoot)
    this.isIndexing = true

    const workerPath = path.join(__dirname, 'searchWorker.js')
    let useWorker = false
    try {
      fsSync.accessSync(workerPath, fsSync.constants.R_OK)
      useWorker = true
    } catch {
      // Worker file not available (e.g. in test environment)
    }

    try {
      if (useWorker) {
        await this.buildWithWorker(workerPath)
      } else {
        await this.buildOnMainThread()
      }
    } finally {
      this.isIndexing = false
    }

    this.startWatching()

    return { fileCount: this.indexedFiles.size, tokenCount: this.index.size }
  }

  private buildWithWorker(workerPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.worker = new Worker(workerPath)

      this.worker.on('message', (msg: any) => {
        switch (msg.type) {
          case 'progress':
            this.sendProgress(msg.indexed, msg.total)
            break

          case 'complete': {
            const data = msg.data as {
              files: string[]
              fileLines: Record<string, string[]>
              index: Record<string, PostingEntry[]>
            }

            // Load the index built by the worker
            this.index.clear()
            this.fileLines.clear()
            this.indexedFiles.clear()

            for (const filePath of data.files) {
              this.indexedFiles.add(filePath)
            }

            for (const [filePath, lines] of Object.entries(data.fileLines)) {
              this.fileLines.set(filePath, lines)
            }

            for (const [token, postings] of Object.entries(data.index)) {
              this.index.set(token, postings)
            }

            this.worker?.terminate()
            this.worker = null
            resolve()
            break
          }

          case 'error':
            this.worker?.terminate()
            this.worker = null
            reject(new Error(msg.message))
            break
        }
      })

      this.worker.on('error', (err) => {
        this.worker = null
        reject(err)
      })

      this.worker.postMessage({ type: 'build', rootPath: this.projectRoot })
    })
  }

  /** Fallback: build index on the main thread with periodic yields. */
  private async buildOnMainThread(): Promise<void> {
    const files = await this.collectFiles(this.projectRoot)
    let indexed = 0

    for (let i = 0; i < files.length; i++) {
      await this.indexFile(files[i])
      indexed++

      if (indexed % 50 === 0) {
        await new Promise(resolve => setImmediate(resolve))
        this.sendProgress(indexed, files.length)
      }
    }

    this.sendProgress(indexed, files.length)
  }

  private async collectFiles(dir: string): Promise<string[]> {
    const files: string[] = []
    await this.walkDir(dir, files)
    return files
  }

  private async walkDir(dir: string, files: string[]): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await this.walkDir(fullPath, files)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SOURCE_EXTENSIONS.has(ext)) {
          files.push(fullPath)
        }
      }
    }
  }

  /**
   * Search the index for a query string.
   * Supports multi-word queries (all words must match in the same file).
   */
  search(query: string, maxResults = 100): SearchResponse {
    const start = performance.now()

    const tokens = this.tokenize(query.toLowerCase())
    if (tokens.length === 0) {
      return { results: [], totalMatches: 0, durationMs: 0 }
    }

    // Find files that contain ALL query tokens
    const candidateFiles = this.findCandidateFiles(tokens)

    // For each candidate file, find matching lines via substring search
    const results: SearchResult[] = []
    const queryLower = query.toLowerCase()

    for (const filePath of candidateFiles) {
      const lines = this.fileLines.get(filePath)
      if (!lines) continue

      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase()
        let searchFrom = 0
        let matchIdx: number

        while ((matchIdx = lineLower.indexOf(queryLower, searchFrom)) !== -1) {
          // Score: boost for exact matches at word boundaries, filename matches
          let score = 1
          // Word boundary bonus
          if (matchIdx === 0 || /\W/.test(lineLower[matchIdx - 1])) score += 2
          // Filename match bonus
          if (path.basename(filePath).toLowerCase().includes(queryLower)) score += 5

          results.push({
            filePath,
            lineNumber: i + 1,
            lineContent: lines[i].trimEnd(),
            matchStart: matchIdx,
            matchEnd: matchIdx + query.length,
            score,
          })

          searchFrom = matchIdx + 1
        }
      }
    }

    // Sort by score descending, then by file path and line number
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath)
      return a.lineNumber - b.lineNumber
    })

    const totalMatches = results.length
    const capped = results.slice(0, maxResults)
    const durationMs = Math.round(performance.now() - start)

    return { results: capped, totalMatches, durationMs }
  }

  /** Get index statistics. */
  getStats(): SearchIndexStats {
    return {
      fileCount: this.indexedFiles.size,
      tokenCount: this.index.size,
      rootPath: this.projectRoot || null,
      indexing: this.isIndexing,
    }
  }

  /** Incrementally add a file to the index. */
  async addFile(absolutePath: string): Promise<void> {
    this.removeFile(absolutePath)
    await this.indexFile(absolutePath)
  }

  /** Remove a file from the index. */
  removeFile(absolutePath: string): void {
    if (!this.indexedFiles.has(absolutePath)) return

    for (const [token, postings] of this.index) {
      const filtered = postings.filter(p => p.filePath !== absolutePath)
      if (filtered.length === 0) {
        this.index.delete(token)
      } else {
        this.index.set(token, filtered)
      }
    }

    this.fileLines.delete(absolutePath)
    this.indexedFiles.delete(absolutePath)
  }

  /** Clean up all resources. */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.index.clear()
    this.fileLines.clear()
    this.indexedFiles.clear()
    this.pendingUpdates.clear()
    this.projectRoot = ''
    this.isIndexing = false
  }

  // -- Internal: file indexing --

  private async indexFile(filePath: string): Promise<void> {
    let content: string
    try {
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_FILE_SIZE) return

      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      return
    }

    const lines = content.split('\n')
    this.fileLines.set(filePath, lines)
    this.indexedFiles.add(filePath)

    const tokenLines = new Map<string, Set<number>>()

    for (let i = 0; i < lines.length; i++) {
      const lineTokens = this.tokenize(lines[i].toLowerCase())
      for (const token of lineTokens) {
        if (!tokenLines.has(token)) {
          tokenLines.set(token, new Set())
        }
        tokenLines.get(token)!.add(i + 1)
      }
    }

    for (const [token, lineNums] of tokenLines) {
      if (!this.index.has(token)) {
        this.index.set(token, [])
      }
      this.index.get(token)!.push({
        filePath,
        lines: Array.from(lineNums),
      })
    }
  }

  private tokenize(text: string): string[] {
    const tokens = text.split(/[^a-z0-9_]+/i).filter(t => t.length >= 2)
    const expanded: string[] = []
    for (const token of tokens) {
      expanded.push(token)
      const parts = token.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' ')
      if (parts.length > 1) {
        for (const part of parts) {
          if (part.length >= 2) expanded.push(part)
        }
      }
    }
    return [...new Set(expanded)]
  }

  private findCandidateFiles(tokens: string[]): Set<string> {
    if (tokens.length === 0) return new Set()

    const postings0 = this.index.get(tokens[0])
    if (!postings0) return new Set()

    let candidates = new Set(postings0.map(p => p.filePath))

    for (let i = 1; i < tokens.length; i++) {
      const postingsI = this.index.get(tokens[i])
      if (!postingsI) return new Set()

      const filesI = new Set(postingsI.map(p => p.filePath))
      candidates = new Set([...candidates].filter(f => filesI.has(f)))

      if (candidates.size === 0) return candidates
    }

    return candidates
  }

  // -- Internal: file watcher for incremental updates --

  private startWatching(): void {
    if (!this.projectRoot) return

    try {
      this.watcher = fsSync.watch(
        this.projectRoot,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          if (!filename || !this.projectRoot) return

          const ext = path.extname(filename).toLowerCase()
          if (!SOURCE_EXTENSIONS.has(ext)) return

          const parts = filename.split(path.sep)
          if (parts.some(p => SKIP_DIRS.has(p) || p.startsWith('.'))) return

          const fullPath = path.join(this.projectRoot, filename)
          this.scheduleUpdate(fullPath)
        }
      )

      this.watcher.on('error', () => {
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
    fsSync.access(fullPath, fsSync.constants.F_OK, (err) => {
      this.pendingUpdates.set(fullPath, err ? 'delete' : 'add')

      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null
        this.flushPending()
      }, WATCHER_DEBOUNCE_MS)
    })
  }

  private async flushPending(): Promise<void> {
    const updates = new Map(this.pendingUpdates)
    this.pendingUpdates.clear()

    for (const [fullPath, action] of updates) {
      if (action === 'delete') {
        this.removeFile(fullPath)
      } else {
        await this.addFile(fullPath)
      }
    }
  }

  private sendProgress(indexed: number, total: number): void {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('search:index-progress', { indexed, total })
    }
  }
}
