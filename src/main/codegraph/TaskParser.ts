/**
 * Task parser: extract intent, keywords, and file hints from natural language (smoke-phq.6).
 *
 * Given a natural language task description (e.g. "fix the payment retry logic
 * that drops failed charges"), extracts:
 *   - Action intent: fix, add, refactor, investigate, test, document, configure, style
 *   - Domain keywords: payment, retry, charges
 *   - Likely file patterns: retry, payment, charge
 *   - File types to include: source + tests (for fix), just source (for investigate)
 *
 * Two modes:
 *   1. AI mode — single Claude call with structured output (requires API key)
 *   2. Heuristic fallback — regex + keyword extraction (no API key needed)
 *
 * Output feeds into the search index and relevance scorer.
 */

// configStore is imported dynamically in parseTask() to avoid hard dependency
// in environments where electron-store is unavailable (e.g., tests).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The action the user wants to perform. */
export type TaskIntent =
  | 'fix'
  | 'add'
  | 'refactor'
  | 'investigate'
  | 'test'
  | 'document'
  | 'configure'
  | 'style'

/** File categories to include in the search. */
export type FileCategory = 'source' | 'test' | 'config' | 'style' | 'docs' | 'types'

/** Result of parsing a natural language task description. */
export interface ParsedTask {
  /** The detected action intent. */
  intent: TaskIntent
  /** Domain keywords extracted from the description. */
  keywords: string[]
  /** Likely filename/path fragments to search for. */
  filePatterns: string[]
  /** File categories to include based on intent. */
  includeFileTypes: FileCategory[]
  /** Whether AI was used for parsing (false = heuristic fallback). */
  usedAi: boolean
}

export interface TaskParseRequest {
  /** The natural language task description. */
  taskDescription: string
  /** Whether to attempt AI parsing (defaults to true, falls back to heuristic). */
  useAi?: boolean
}

// ---------------------------------------------------------------------------
// Intent detection patterns
// ---------------------------------------------------------------------------

const INTENT_PATTERNS: Array<{ intent: TaskIntent; pattern: RegExp }> = [
  { intent: 'fix', pattern: /\b(fix|bug|broken|crash|error|fail|wrong|issue|repair|patch|resolve|debug)\b/i },
  { intent: 'add', pattern: /\b(add|create|implement|build|introduce|new|feature|support|enable)\b/i },
  { intent: 'refactor', pattern: /\b(refactor|clean\s*up|restructure|reorganize|simplify|extract|rename|move|decouple|improve)\b/i },
  { intent: 'investigate', pattern: /\b(investigate|understand|find|look|check|inspect|trace|diagnose|analyze|audit|review|explore|where|why|how)\b/i },
  { intent: 'test', pattern: /\b(test|tests|testing|spec|specs|coverage|unit\s*test|integration\s*test|e2e)\b/i },
  { intent: 'document', pattern: /\b(document|docs|documentation|readme|comment|comments|jsdoc|tsdoc|annotate)\b/i },
  { intent: 'configure', pattern: /\b(configure|config|configuration|settings|setup|env|environment|deploy|ci|cd|pipeline)\b/i },
  { intent: 'style', pattern: /\b(style|styles|css|scss|sass|theme|design|layout|responsive|animation|ui|ux)\b/i },
]

/** Map intent to the file categories that should be included. */
const INTENT_FILE_TYPES: Record<TaskIntent, FileCategory[]> = {
  fix: ['source', 'test'],
  add: ['source', 'test', 'types'],
  refactor: ['source', 'test'],
  investigate: ['source'],
  test: ['test', 'source'],
  document: ['docs', 'source'],
  configure: ['config'],
  style: ['style', 'source'],
}

// ---------------------------------------------------------------------------
// Stop words (for keyword extraction)
// ---------------------------------------------------------------------------

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
])

/** Words that indicate intent but aren't useful as domain keywords. */
const INTENT_WORDS = new Set([
  'fix', 'bug', 'broken', 'crash', 'error', 'fail', 'wrong', 'issue',
  'add', 'create', 'implement', 'build', 'introduce', 'new', 'feature',
  'refactor', 'clean', 'restructure', 'reorganize', 'simplify', 'extract',
  'investigate', 'understand', 'find', 'look', 'check', 'inspect', 'trace',
  'test', 'tests', 'testing', 'spec', 'specs', 'coverage',
  'document', 'docs', 'documentation', 'readme', 'comment', 'comments',
  'configure', 'config', 'configuration', 'settings', 'setup',
  'style', 'styles', 'design', 'layout',
  'make', 'use', 'using', 'want', 'like', 'get', 'work', 'change',
  'update', 'support', 'enable', 'move', 'rename', 'improve',
  'repair', 'patch', 'resolve', 'debug', 'diagnose', 'analyze',
])

// ---------------------------------------------------------------------------
// Heuristic parsing
// ---------------------------------------------------------------------------

/** Detect the primary intent from the task description. */
function detectIntent(text: string): TaskIntent {
  // Check patterns in priority order (fix > add > refactor > ...)
  for (const { intent, pattern } of INTENT_PATTERNS) {
    if (pattern.test(text)) {
      return intent
    }
  }
  // Default to investigate if no clear intent
  return 'investigate'
}

/**
 * Extract domain keywords from a task description.
 * Filters out stop words and intent words to keep only domain-relevant terms.
 */
function extractDomainKeywords(text: string): string[] {
  const words = new Set<string>()

  // Split camelCase/PascalCase
  const camelSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2')

  // Split on non-alphanumeric
  const tokens = camelSplit.split(/[^a-zA-Z0-9._-]+/)

  for (const token of tokens) {
    const lower = token.toLowerCase().replace(/^[._-]+|[._-]+$/g, '')
    if (lower.length < 2) continue
    if (STOP_WORDS.has(lower)) continue
    if (INTENT_WORDS.has(lower)) continue
    words.add(lower)
  }

  return Array.from(words)
}

/**
 * Derive likely file patterns from domain keywords.
 * These are fragments that might appear in filenames or directory paths.
 */
function deriveFilePatterns(keywords: string[]): string[] {
  const patterns = new Set<string>()

  for (const keyword of keywords) {
    // Add the keyword itself as a pattern
    patterns.add(keyword)

    // If keyword is compound (snake_case already split), add as-is
    // Also generate common naming variants
    if (keyword.length > 3) {
      // Plural/singular variants
      if (keyword.endsWith('s') && keyword.length > 4) {
        patterns.add(keyword.slice(0, -1))
      } else if (!keyword.endsWith('s')) {
        patterns.add(keyword + 's')
      }

      // "er" suffix for agent nouns (e.g., "retry" → "retrier", "handle" → "handler")
      if (keyword.endsWith('le')) {
        patterns.add(keyword.slice(0, -1) + 'r')
      } else if (keyword.endsWith('e')) {
        patterns.add(keyword + 'r')
      }
    }
  }

  return Array.from(patterns)
}

/**
 * Parse a task description using heuristics only (no AI).
 */
export function parseTaskHeuristic(taskDescription: string): ParsedTask {
  const intent = detectIntent(taskDescription)
  const keywords = extractDomainKeywords(taskDescription)
  const filePatterns = deriveFilePatterns(keywords)
  const includeFileTypes = INTENT_FILE_TYPES[intent]

  return {
    intent,
    keywords,
    filePatterns,
    includeFileTypes,
    usedAi: false,
  }
}

// ---------------------------------------------------------------------------
// AI-powered parsing
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parse a natural language task description into structured data.
 *
 * Attempts AI parsing if `useAi` is true and an API key is configured.
 * Falls back to heuristic parsing on any failure.
 */
export async function parseTask(request: TaskParseRequest): Promise<ParsedTask> {
  const { taskDescription, useAi = true } = request

  if (!taskDescription || taskDescription.trim().length === 0) {
    return {
      intent: 'investigate',
      keywords: [],
      filePatterns: [],
      includeFileTypes: ['source'],
      usedAi: false,
    }
  }

  // AI-enhanced parsing via direct API calls has been removed.
  // Claude Code now handles all AI interactions via MCP.
  // Task parsing always uses the heuristic path.

  return parseTaskHeuristic(taskDescription)
}
