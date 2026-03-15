/**
 * Worker thread for building the full-text search index.
 *
 * Walks the project directory, reads source files, tokenizes contents,
 * and builds the inverted index. Sends progress updates and the completed
 * index back to the main thread via postMessage.
 */

import { parentPort } from 'worker_threads'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'

// ---- Types for worker ↔ main communication ----

interface BuildRequest {
  type: 'build'
  rootPath: string
}

interface ProgressMessage {
  type: 'progress'
  indexed: number
  total: number
}

interface CompleteMessage {
  type: 'complete'
  data: SerializedIndex
}

interface ErrorMessage {
  type: 'error'
  message: string
}

interface FilePostingEntry {
  filePath: string
  lines: number[]
}

interface SerializedIndex {
  files: string[]
  fileLines: Record<string, string[]>
  index: Record<string, FilePostingEntry[]>
}

// ---- Config ----

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

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', '.next',
  '__pycache__', '.tox', 'venv', '.venv', 'target',
  '.cache', '.turbo', '.parcel-cache', 'coverage',
  '.DS_Store', '.beads',
])

const MAX_FILE_SIZE = 256 * 1024
const BATCH_SIZE = 200

// ---- Tokenizer ----

function tokenize(text: string): string[] {
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

// ---- File collection ----

async function collectFiles(rootPath: string): Promise<string[]> {
  const files: string[] = []

  async function walk(dirPath: string): Promise<void> {
    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    const subdirs: Promise<void>[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          subdirs.push(walk(path.join(dirPath, entry.name)))
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SOURCE_EXTENSIONS.has(ext)) {
          files.push(path.join(dirPath, entry.name))
        }
      }
    }

    await Promise.all(subdirs)
  }

  await walk(rootPath)
  return files
}

// ---- Index building ----

async function buildIndex(rootPath: string): Promise<void> {
  const filePaths = await collectFiles(rootPath)
  const total = filePaths.length

  send({ type: 'progress', indexed: 0, total })

  const indexedFiles: string[] = []
  const fileLines: Record<string, string[]> = {}
  const index: Record<string, FilePostingEntry[]> = {}

  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (filePath) => {
        try {
          const stat = await fsp.stat(filePath)
          if (stat.size > MAX_FILE_SIZE) return

          const content = await fsp.readFile(filePath, 'utf-8')
          const lines = content.split('\n')

          indexedFiles.push(filePath)
          fileLines[filePath] = lines

          // Build token → line mapping for this file
          const tokenLines = new Map<string, Set<number>>()

          for (let j = 0; j < lines.length; j++) {
            const lineTokens = tokenize(lines[j].toLowerCase())
            for (const token of lineTokens) {
              if (!tokenLines.has(token)) {
                tokenLines.set(token, new Set())
              }
              tokenLines.get(token)!.add(j + 1)
            }
          }

          // Add to index
          for (const [token, lineNums] of tokenLines) {
            if (!index[token]) {
              index[token] = []
            }
            index[token].push({
              filePath,
              lines: Array.from(lineNums),
            })
          }
        } catch {
          // Skip unreadable files
        }
      })
    )

    const indexed = Math.min(i + BATCH_SIZE, total)
    send({ type: 'progress', indexed, total })
  }

  send({
    type: 'complete',
    data: { files: indexedFiles, fileLines, index },
  })
}

function send(msg: ProgressMessage | CompleteMessage | ErrorMessage): void {
  parentPort!.postMessage(msg)
}

// ---- Entry point ----

parentPort!.on('message', (msg: BuildRequest) => {
  if (msg.type === 'build') {
    buildIndex(msg.rootPath).catch((err) => {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    })
  }
})
