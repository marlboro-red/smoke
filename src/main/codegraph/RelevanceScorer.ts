/**
 * Relevance scoring engine for file-to-task matching (smoke-phq.3).
 *
 * Given a natural language task description and a set of candidate file paths,
 * scores each file's relevance using multiple signals:
 * 1. Filename/path keyword overlap
 * 2. Content keyword matches
 * 3. Import proximity to already-relevant files
 * 4. File type boosting (test files when task mentions testing)
 * 5. Recency of modification
 *
 * Returns a ranked list. Runs in main process.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { ensureIndex } from './graphBuilder'
import { CodeGraph } from './CodeGraph'
import { parseImports, detectLanguage } from './importParser'
import { resolveAllImports, loadPathAliases, type PathAliases } from './importResolver'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoredFile {
  filePath: string
  score: number
  signals: {
    pathKeyword: number
    contentKeyword: number
    importProximity: number
    fileTypeBoost: number
    recency: number
  }
}

export interface RelevanceScoringRequest {
  taskDescription: string
  candidateFiles: string[]
  projectRoot: string
  /** Files already known to be relevant — used for import proximity scoring. */
  seedFiles?: string[]
  /** Max files to return. Defaults to all. */
  limit?: number
}

export interface RelevanceScoringResult {
  rankedFiles: ScoredFile[]
  keywords: string[]
}

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

/** Common English stop words to filter out. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'how', 'why',
  'not', 'no', 'nor', 'so', 'too', 'very',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
  'into', 'about', 'between', 'through', 'after', 'before', 'during',
  'up', 'down', 'out', 'off', 'over', 'under',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any',
  'such', 'only', 'own', 'same', 'than', 'just', 'also',
  'file', 'files', 'code', 'change', 'changes', 'make', 'add', 'update',
  'fix', 'work', 'use', 'using', 'want', 'like', 'get',
])

/**
 * Extract meaningful keywords from a natural language task description.
 * Splits on word boundaries, lowercases, removes stop words,
 * and preserves camelCase/PascalCase subwords.
 */
export function extractKeywords(text: string): string[] {
  const words = new Set<string>()

  // Split camelCase/PascalCase: "useWindowDrag" → ["use", "window", "drag"]
  const camelSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2')

  // Split on non-alphanumeric (keeps dots for extensions like .tsx)
  const tokens = camelSplit.split(/[^a-zA-Z0-9._-]+/)

  for (const token of tokens) {
    const lower = token.toLowerCase().replace(/^[._-]+|[._-]+$/g, '')
    if (lower.length < 2) continue
    if (STOP_WORDS.has(lower)) continue
    words.add(lower)
  }

  return Array.from(words)
}

// ---------------------------------------------------------------------------
// Signal: Task intent detection
// ---------------------------------------------------------------------------

interface TaskIntent {
  mentionsTest: boolean
  mentionsConfig: boolean
  mentionsStyle: boolean
  mentionsDocs: boolean
  mentionsApi: boolean
  mentionsTypes: boolean
}

const TEST_PATTERNS = /\b(test|tests|testing|spec|specs|jest|vitest|mocha|__tests__|\.test\.|\.spec\.)\b/i
const CONFIG_PATTERNS = /\b(config|configuration|settings|preferences|env|\.env|\.yaml|\.yml|\.json|\.toml)\b/i
const STYLE_PATTERNS = /\b(style|styles|css|scss|sass|less|theme|themes|styling)\b/i
const DOCS_PATTERNS = /\b(docs|documentation|readme|guide|tutorial|comment|jsdoc)\b/i
const API_PATTERNS = /\b(api|endpoint|route|routes|handler|handlers|controller|middleware|ipc)\b/i
const TYPES_PATTERNS = /\b(type|types|interface|interfaces|typedef|schema|typing|typings)\b/i

function detectTaskIntent(text: string): TaskIntent {
  return {
    mentionsTest: TEST_PATTERNS.test(text),
    mentionsConfig: CONFIG_PATTERNS.test(text),
    mentionsStyle: STYLE_PATTERNS.test(text),
    mentionsDocs: DOCS_PATTERNS.test(text),
    mentionsApi: API_PATTERNS.test(text),
    mentionsTypes: TYPES_PATTERNS.test(text),
  }
}

// ---------------------------------------------------------------------------
// Signal 1: Path/filename keyword overlap
// ---------------------------------------------------------------------------

function scorePathKeyword(filePath: string, keywords: string[], projectRoot: string): number {
  // Use relative path for matching
  const rel = path.relative(projectRoot, filePath).toLowerCase()
  const parts = rel.split(/[/\\._-]+/)

  let score = 0
  for (const keyword of keywords) {
    const kw = keyword.toLowerCase()

    // Exact match in filename (strongest signal)
    const basename = path.basename(filePath, path.extname(filePath)).toLowerCase()
    if (basename === kw) {
      score += 10
      continue
    }

    // Basename contains keyword
    if (basename.includes(kw)) {
      score += 6
      continue
    }

    // Path segment exact match (directory name)
    if (parts.includes(kw)) {
      score += 4
      continue
    }

    // Substring match anywhere in relative path
    if (rel.includes(kw)) {
      score += 2
    }
  }

  return score
}

// ---------------------------------------------------------------------------
// Signal 2: Content keyword matches
// ---------------------------------------------------------------------------

const CONTENT_READ_LIMIT = 8192 // Read up to 8KB for keyword scanning

async function scoreContentKeyword(filePath: string, keywords: string[]): Promise<number> {
  let content: string
  try {
    const fd = await fs.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(CONTENT_READ_LIMIT)
      const { bytesRead } = await fd.read(buf, 0, CONTENT_READ_LIMIT, 0)
      content = buf.toString('utf-8', 0, bytesRead).toLowerCase()
    } finally {
      await fd.close()
    }
  } catch {
    return 0
  }

  let score = 0
  for (const keyword of keywords) {
    const kw = keyword.toLowerCase()
    // Count occurrences, cap at 5 to avoid over-weighting verbose files
    let count = 0
    let idx = 0
    while ((idx = content.indexOf(kw, idx)) !== -1) {
      count++
      idx += kw.length
      if (count >= 5) break
    }
    score += count
  }

  return score
}

// ---------------------------------------------------------------------------
// Signal 3: Import proximity
// ---------------------------------------------------------------------------

/**
 * Build a lightweight import graph from the seed files and score candidates
 * by their BFS distance. Closer = higher score.
 */
async function scoreImportProximity(
  candidateFiles: string[],
  seedFiles: string[],
  projectRoot: string,
): Promise<Map<string, number>> {
  const scores = new Map<string, number>()
  if (seedFiles.length === 0) return scores

  const index = await ensureIndex(projectRoot)
  const aliases = await loadPathAliases(projectRoot)
  const graph = new CodeGraph()
  const candidateSet = new Set(candidateFiles)

  // BFS from seed files, max depth 3
  const visited = new Set<string>()
  const queue: Array<{ filePath: string; depth: number }> = seedFiles.map(f => ({ filePath: f, depth: 0 }))

  for (const seed of seedFiles) {
    graph.addNode(seed, 0)
    visited.add(seed)
  }

  while (queue.length > 0) {
    const { filePath, depth } = queue.shift()!
    if (depth >= 3) continue

    let content: string
    try {
      const fd = await fs.open(filePath, 'r')
      try {
        const buf = Buffer.alloc(4096)
        const { bytesRead } = await fd.read(buf, 0, 4096, 0)
        content = buf.toString('utf-8', 0, bytesRead)
      } finally {
        await fd.close()
      }
    } catch {
      continue
    }

    const language = detectLanguage(filePath)
    const parsed = parseImports(content, language)
    const resolved = resolveAllImports(parsed, filePath, language, index, aliases)

    for (const imp of resolved) {
      if (!imp.resolvedPath) continue

      const isNew = !visited.has(imp.resolvedPath)
      if (isNew) {
        visited.add(imp.resolvedPath)
        graph.addNode(imp.resolvedPath, depth + 1)
        queue.push({ filePath: imp.resolvedPath, depth: depth + 1 })
      }

      graph.addEdge(filePath, imp.resolvedPath)
    }
  }

  // Score candidates by BFS distance from any seed
  for (const candidate of candidateFiles) {
    const node = graph.nodes.get(candidate)
    if (node && node.depth >= 0) {
      // Closer = higher score. depth 1 → 6pts, depth 2 → 3pts, depth 3 → 1pt
      const proximity = Math.max(0, 7 - node.depth * 2)
      scores.set(candidate, proximity)
    }
  }

  return scores
}

// ---------------------------------------------------------------------------
// Signal 4: File type boost
// ---------------------------------------------------------------------------

function scoreFileType(filePath: string, intent: TaskIntent): number {
  const lower = filePath.toLowerCase()
  const basename = path.basename(lower)
  let score = 0

  // Test file detection
  const isTestFile = /\.(test|spec)\.[^.]+$/.test(basename) ||
    lower.includes('__tests__') ||
    lower.includes('/test/') ||
    lower.includes('/tests/')

  if (isTestFile) {
    score += intent.mentionsTest ? 5 : -2  // boost if testing, penalize otherwise
  }

  // Config file detection
  const isConfigFile = /\.(config|rc)\.[^.]+$/.test(basename) ||
    basename.startsWith('.') ||
    /\.(json|yaml|yml|toml|env)$/.test(basename)

  if (isConfigFile) {
    score += intent.mentionsConfig ? 4 : -1
  }

  // Style file detection
  const isStyleFile = /\.(css|scss|sass|less)$/.test(basename)
  if (isStyleFile) {
    score += intent.mentionsStyle ? 4 : -1
  }

  // Type declaration files
  const isTypeFile = basename.endsWith('.d.ts') ||
    basename === 'types.ts' ||
    basename === 'types.tsx' ||
    lower.includes('/types/')

  if (isTypeFile) {
    score += intent.mentionsTypes ? 4 : 0
  }

  // API / IPC handler files
  const isApiFile = lower.includes('/api/') ||
    lower.includes('/routes/') ||
    lower.includes('/ipc/') ||
    lower.includes('/handlers/') ||
    basename.includes('handler') ||
    basename.includes('controller')

  if (isApiFile) {
    score += intent.mentionsApi ? 4 : 0
  }

  return score
}

// ---------------------------------------------------------------------------
// Signal 5: Recency of modification
// ---------------------------------------------------------------------------

async function scoreRecency(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath)
    const ageMs = Date.now() - stat.mtimeMs
    const ageHours = ageMs / (1000 * 60 * 60)

    // Recent modifications get a boost
    if (ageHours < 1) return 5       // modified in last hour
    if (ageHours < 24) return 3      // modified today
    if (ageHours < 24 * 7) return 1  // modified this week
    return 0
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

/** Signal weights for the final composite score. */
const WEIGHTS = {
  pathKeyword: 1.0,
  contentKeyword: 0.8,
  importProximity: 1.2,
  fileTypeBoost: 0.6,
  recency: 0.4,
} as const

export async function scoreRelevance(
  request: RelevanceScoringRequest
): Promise<RelevanceScoringResult> {
  const {
    taskDescription,
    candidateFiles,
    projectRoot,
    seedFiles = [],
    limit,
  } = request

  const keywords = extractKeywords(taskDescription)
  const intent = detectTaskIntent(taskDescription)

  // Compute import proximity scores (single pass for all candidates)
  const proximityScores = await scoreImportProximity(candidateFiles, seedFiles, projectRoot)

  // Score each candidate file in parallel
  const scored = await Promise.all(
    candidateFiles.map(async (filePath): Promise<ScoredFile> => {
      const [contentScore, recencyScore] = await Promise.all([
        scoreContentKeyword(filePath, keywords),
        scoreRecency(filePath),
      ])

      const signals = {
        pathKeyword: scorePathKeyword(filePath, keywords, projectRoot),
        contentKeyword: contentScore,
        importProximity: proximityScores.get(filePath) ?? 0,
        fileTypeBoost: scoreFileType(filePath, intent),
        recency: recencyScore,
      }

      const score =
        signals.pathKeyword * WEIGHTS.pathKeyword +
        signals.contentKeyword * WEIGHTS.contentKeyword +
        signals.importProximity * WEIGHTS.importProximity +
        signals.fileTypeBoost * WEIGHTS.fileTypeBoost +
        signals.recency * WEIGHTS.recency

      return { filePath, score, signals }
    })
  )

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score)

  const rankedFiles = limit ? scored.slice(0, limit) : scored

  return { rankedFiles, keywords }
}
