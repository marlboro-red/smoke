/**
 * Full-text search index for project source files (smoke-phq.1).
 *
 * Indexes file contents using a word-level inverted index for fast
 * keyword search. Supports querying by keyword, function name, class name,
 * or any string. Returns ranked results with file path, line number, and
 * surrounding context.
 *
 * Runs on the main thread (async with periodic yields to avoid blocking).
 * Index is built on demand and updated incrementally via file watcher.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
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
  '.DS_Store',
])

/** Maximum file size to index (256KB). */
const MAX_FILE_SIZE = 256 * 1024

/** Batch size: yield to event loop every N files. */
const BATCH_SIZE = 50

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
  private getMainWindow: () => BrowserWindow | null

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow
  }

  /** Build the full index for a project. */
  async build(projectRoot: string): Promise<{ fileCount: number; tokenCount: number }> {
    this.projectRoot = path.resolve(projectRoot)
    this.index.clear()
    this.fileLines.clear()
    this.indexedFiles.clear()
    this.isIndexing = true

    try {
      const files = await this.collectFiles(this.projectRoot)
      let indexed = 0

      for (let i = 0; i < files.length; i++) {
        await this.indexFile(files[i])
        indexed++

        // Yield to event loop periodically and report progress
        if (indexed % BATCH_SIZE === 0) {
          await new Promise(resolve => setImmediate(resolve))
          this.sendProgress(indexed, files.length)
        }
      }

      this.sendProgress(indexed, files.length)
    } finally {
      this.isIndexing = false
    }

    return { fileCount: this.indexedFiles.size, tokenCount: this.index.size }
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
    // Remove old entry first
    this.removeFile(absolutePath)
    await this.indexFile(absolutePath)
  }

  /** Remove a file from the index. */
  removeFile(absolutePath: string): void {
    if (!this.indexedFiles.has(absolutePath)) return

    // Remove from posting lists
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

  // -- Internal --

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

    // Build token → line mapping for this file
    const tokenLines = new Map<string, Set<number>>()

    for (let i = 0; i < lines.length; i++) {
      const lineTokens = this.tokenize(lines[i].toLowerCase())
      for (const token of lineTokens) {
        if (!tokenLines.has(token)) {
          tokenLines.set(token, new Set())
        }
        tokenLines.get(token)!.add(i + 1) // 1-based
      }
    }

    // Add to global inverted index
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
    // Split on non-alphanumeric chars, filter short tokens
    const tokens = text.split(/[^a-z0-9_]+/i).filter(t => t.length >= 2)
    // Also split camelCase/PascalCase
    const expanded: string[] = []
    for (const token of tokens) {
      expanded.push(token)
      // Split camelCase: "parseImports" → "parse", "imports"
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

    // Start with files containing the first token
    const postings0 = this.index.get(tokens[0])
    if (!postings0) return new Set()

    let candidates = new Set(postings0.map(p => p.filePath))

    // Intersect with files containing subsequent tokens
    for (let i = 1; i < tokens.length; i++) {
      const postingsI = this.index.get(tokens[i])
      if (!postingsI) return new Set()

      const filesI = new Set(postingsI.map(p => p.filePath))
      candidates = new Set([...candidates].filter(f => filesI.has(f)))

      if (candidates.size === 0) return candidates
    }

    return candidates
  }

  private sendProgress(indexed: number, total: number): void {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('search:index-progress', { indexed, total })
    }
  }
}
