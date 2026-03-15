/**
 * Context collector: find relevant files for a task description (smoke-phq.7).
 *
 * The core pipeline that connects task parsing to file discovery:
 * 1. Parse the task → keywords, intent, file patterns, file types
 * 2. Query the search index for keyword matches
 * 3. Query the structure analyzer for relevant modules
 * 4. For top candidates, use the import graph to find connected files
 * 5. Score all candidates with the relevance engine
 * 6. Return the top N files with their import relationships and relevance scores
 *
 * Runs in main process, orchestrates the other components.
 */

import * as path from 'path'
import { parseTask, type ParsedTask, type FileCategory } from './TaskParser'
import { SearchIndex, type SearchResult } from './SearchIndex'
import { StructureAnalyzer, type StructureMap, type ModuleInfo } from './StructureAnalyzer'
import { scoreRelevance, type ScoredFile } from './RelevanceScorer'
import { buildCodeGraph, ensureIndex } from './graphBuilder'
import { CodeGraph, type CodeNode } from './CodeGraph'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextCollectRequest {
  /** Natural language task description. */
  taskDescription: string
  /** Project root path. */
  projectRoot: string
  /** Max files to return. Default: 15 */
  maxFiles?: number
  /** Whether to use AI for task parsing. Default: true */
  useAi?: boolean
  /** Import graph traversal depth from seed files. Default: 2 */
  graphDepth?: number
}

export interface ContextFile {
  /** Absolute file path. */
  filePath: string
  /** Relevance score (higher = more relevant). */
  relevance: number
  /** Files this file imports (within the result set). */
  imports: string[]
  /** Files that import this file (within the result set). */
  importedBy: string[]
  /** How this file was discovered. */
  source: 'search' | 'import-graph' | 'structure' | 'file-pattern'
  /** Module this file belongs to, if detected. */
  moduleId?: string
}

export interface ContextCollectResult {
  /** Ranked files with import relationships. */
  files: ContextFile[]
  /** The parsed task (for transparency/debugging). */
  parsedTask: ParsedTask
  /** Structure map of the project. */
  structureMap: StructureMap | null
  /** Timing breakdown in ms. */
  timing: {
    parse: number
    search: number
    structure: number
    graph: number
    scoring: number
    total: number
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_FILES = 15
const DEFAULT_GRAPH_DEPTH = 2
const MAX_SEARCH_RESULTS_PER_KEYWORD = 50
const MAX_CANDIDATES_FOR_SCORING = 200
const TOP_SEEDS_FOR_GRAPH = 10

// ---------------------------------------------------------------------------
// File category filters
// ---------------------------------------------------------------------------

const FILE_TYPE_PATTERNS: Record<FileCategory, RegExp> = {
  source: /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|c|cpp|cc|h|hpp|cs|rb|php|swift|scala|vue|svelte)$/i,
  test: /\.(test|spec)\.[^.]+$|__tests__|\/test\/|\/tests\//i,
  config: /\.(json|yaml|yml|toml|env|config\.[^.]+)$|tsconfig|Makefile|Dockerfile/i,
  style: /\.(css|scss|sass|less)$/i,
  docs: /\.(md|txt|rst|adoc)$/i,
  types: /\.d\.ts$|\/types\//i,
}

function matchesFileCategory(filePath: string, categories: FileCategory[]): boolean {
  if (categories.length === 0) return true
  return categories.some(cat => FILE_TYPE_PATTERNS[cat].test(filePath))
}

// ---------------------------------------------------------------------------
// Main collector
// ---------------------------------------------------------------------------

/**
 * Collect relevant files for a task description.
 *
 * Orchestrates the full pipeline: parse → search → structure → graph → score.
 */
export async function collectContext(
  request: ContextCollectRequest,
  searchIndex: SearchIndex,
  structureAnalyzer: StructureAnalyzer,
): Promise<ContextCollectResult> {
  const {
    taskDescription,
    projectRoot,
    maxFiles = DEFAULT_MAX_FILES,
    useAi = true,
    graphDepth = DEFAULT_GRAPH_DEPTH,
  } = request

  const totalStart = performance.now()
  const timing = { parse: 0, search: 0, structure: 0, graph: 0, scoring: 0, total: 0 }

  // ── Step 1: Parse the task ──

  const parseStart = performance.now()
  const parsedTask = await parseTask({ taskDescription, useAi })
  timing.parse = performance.now() - parseStart

  // ── Step 2: Search index queries ──

  const searchStart = performance.now()
  const searchCandidates = searchForCandidates(
    searchIndex, parsedTask, projectRoot,
  )
  timing.search = performance.now() - searchStart

  // ── Step 3: Structure analysis ──

  const structureStart = performance.now()
  let structureMap = structureAnalyzer.getCached()
  if (!structureMap) {
    structureMap = await structureAnalyzer.analyze(projectRoot)
  }
  const structureCandidates = findStructureCandidates(
    structureMap, parsedTask, projectRoot,
  )
  timing.structure = performance.now() - structureStart

  // ── Step 4: Merge candidates and expand via import graph ──

  const graphStart = performance.now()

  // Deduplicate all candidate file paths
  const candidateMap = new Map<string, 'search' | 'structure' | 'file-pattern'>()

  for (const filePath of searchCandidates) {
    candidateMap.set(filePath, 'search')
  }
  for (const filePath of structureCandidates) {
    if (!candidateMap.has(filePath)) {
      candidateMap.set(filePath, 'structure')
    }
  }

  // Pick top seeds for graph expansion (use search results, they're pre-ranked)
  const seedFiles = searchCandidates.slice(0, TOP_SEEDS_FOR_GRAPH)

  // Expand seeds via import graph
  const graphFiles = await expandViaImportGraph(
    seedFiles, projectRoot, graphDepth, candidateMap,
  )
  for (const filePath of graphFiles) {
    if (!candidateMap.has(filePath)) {
      candidateMap.set(filePath, 'import-graph')
    }
  }

  timing.graph = performance.now() - graphStart

  // ── Step 5: Score all candidates ──

  const scoringStart = performance.now()

  // Cap candidates to avoid excessive scoring time
  const allCandidates = Array.from(candidateMap.keys()).slice(0, MAX_CANDIDATES_FOR_SCORING)

  // Filter by file types the task requires
  const filteredCandidates = allCandidates.filter(
    fp => matchesFileCategory(fp, parsedTask.includeFileTypes),
  )

  // If filtering removed everything, fall back to all candidates
  const scoringCandidates = filteredCandidates.length > 0 ? filteredCandidates : allCandidates

  const scoringResult = await scoreRelevance({
    taskDescription,
    candidateFiles: scoringCandidates,
    projectRoot,
    seedFiles,
    limit: maxFiles,
  })

  timing.scoring = performance.now() - scoringStart

  // ── Step 6: Build result with import relationships ──

  const resultFilePaths = new Set(scoringResult.rankedFiles.map(f => f.filePath))

  // Build a lightweight import graph for just the result files
  const importRelations = await buildImportRelations(
    scoringResult.rankedFiles, projectRoot, resultFilePaths,
  )

  // Normalize scores to 0–1 range for WorkspaceLayoutPlanner
  const maxScore = scoringResult.rankedFiles[0]?.score ?? 1
  const minScore = scoringResult.rankedFiles[scoringResult.rankedFiles.length - 1]?.score ?? 0
  const scoreRange = maxScore - minScore || 1

  const files: ContextFile[] = scoringResult.rankedFiles.map(scored => ({
    filePath: scored.filePath,
    relevance: (scored.score - minScore) / scoreRange,
    imports: importRelations.get(scored.filePath)?.imports ?? [],
    importedBy: importRelations.get(scored.filePath)?.importedBy ?? [],
    source: candidateMap.get(scored.filePath) ?? 'search',
    moduleId: findModuleForFile(scored.filePath, structureMap),
  }))

  timing.total = performance.now() - totalStart

  return { files, parsedTask, structureMap, timing }
}

// ---------------------------------------------------------------------------
// Step 2: Search index queries
// ---------------------------------------------------------------------------

function searchForCandidates(
  searchIndex: SearchIndex,
  parsedTask: ParsedTask,
  projectRoot: string,
): string[] {
  const stats = searchIndex.getStats()
  if (!stats.rootPath || stats.fileCount === 0) return []

  const fileScores = new Map<string, number>()

  // Search for each keyword
  for (const keyword of parsedTask.keywords) {
    const response = searchIndex.search(keyword, MAX_SEARCH_RESULTS_PER_KEYWORD)
    for (const result of response.results) {
      const prev = fileScores.get(result.filePath) ?? 0
      fileScores.set(result.filePath, prev + result.score)
    }
  }

  // Search for file patterns (likely filenames)
  for (const pattern of parsedTask.filePatterns) {
    const response = searchIndex.search(pattern, MAX_SEARCH_RESULTS_PER_KEYWORD)
    for (const result of response.results) {
      // Boost file pattern matches — they're stronger signals
      const prev = fileScores.get(result.filePath) ?? 0
      fileScores.set(result.filePath, prev + result.score * 1.5)
    }
  }

  // Sort by accumulated score, return file paths
  return Array.from(fileScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([filePath]) => filePath)
}

// ---------------------------------------------------------------------------
// Step 3: Structure-based candidates
// ---------------------------------------------------------------------------

function findStructureCandidates(
  structureMap: StructureMap,
  parsedTask: ParsedTask,
  _projectRoot: string,
): string[] {
  const candidates: string[] = []

  for (const [_id, mod] of Object.entries(structureMap.modules)) {
    // Check if any keyword matches the module name or id
    const moduleNameLower = mod.name.toLowerCase()
    const moduleIdLower = mod.id.toLowerCase()

    const matches = parsedTask.keywords.some(kw => {
      const kwLower = kw.toLowerCase()
      return moduleNameLower.includes(kwLower) || moduleIdLower.includes(kwLower)
    })

    if (!matches) continue

    // Add the module's entry point
    if (mod.entryPoint) {
      const entryPath = path.resolve(mod.rootPath, mod.entryPoint)
      candidates.push(entryPath)
    }

    // Add key files that aren't just marker files
    for (const kf of mod.keyFiles) {
      if (kf === 'package.json' || kf === 'tsconfig.json') continue
      const kfPath = path.resolve(mod.rootPath, kf)
      candidates.push(kfPath)
    }
  }

  return candidates
}

// ---------------------------------------------------------------------------
// Step 4: Import graph expansion
// ---------------------------------------------------------------------------

async function expandViaImportGraph(
  seedFiles: string[],
  projectRoot: string,
  graphDepth: number,
  existingCandidates: Map<string, string>,
): Promise<string[]> {
  if (seedFiles.length === 0) return []

  const newFiles: string[] = []

  // Build import graphs from each seed file (limited to avoid excessive I/O)
  // Process seeds concurrently with a concurrency limit
  const CONCURRENCY = 5
  const batches: string[][] = []
  for (let i = 0; i < seedFiles.length; i += CONCURRENCY) {
    batches.push(seedFiles.slice(i, i + CONCURRENCY))
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (seedFile) => {
        try {
          const result = await buildCodeGraph({
            filePath: seedFile,
            projectRoot,
            maxDepth: graphDepth,
          })
          return result.graph.nodes
            .map(n => n.filePath)
            .filter(fp => !existingCandidates.has(fp))
        } catch {
          return []
        }
      }),
    )
    for (const files of results) {
      newFiles.push(...files)
    }
  }

  return [...new Set(newFiles)]
}

// ---------------------------------------------------------------------------
// Step 6: Build import relations for result files
// ---------------------------------------------------------------------------

interface ImportRelation {
  imports: string[]
  importedBy: string[]
}

async function buildImportRelations(
  rankedFiles: ScoredFile[],
  projectRoot: string,
  resultSet: Set<string>,
): Promise<Map<string, ImportRelation>> {
  const relations = new Map<string, ImportRelation>()

  // Initialize all files
  for (const f of rankedFiles) {
    relations.set(f.filePath, { imports: [], importedBy: [] })
  }

  if (rankedFiles.length === 0) return relations

  // Build a single graph from the top-scored file to capture edges
  try {
    const topFile = rankedFiles[0].filePath
    const result = await buildCodeGraph({
      filePath: topFile,
      projectRoot,
      maxDepth: 3,
    })

    const graph = CodeGraph.fromJSON(result.graph)

    // Extract only edges between files in our result set
    for (const edge of result.graph.edges) {
      if (!resultSet.has(edge.from) || !resultSet.has(edge.to)) continue

      const fromRel = relations.get(edge.from)
      const toRel = relations.get(edge.to)
      if (fromRel && !fromRel.imports.includes(edge.to)) {
        fromRel.imports.push(edge.to)
      }
      if (toRel && !toRel.importedBy.includes(edge.from)) {
        toRel.importedBy.push(edge.from)
      }
    }

    // Also check for edges from other result files not caught by the single graph
    for (const node of result.graph.nodes) {
      if (!resultSet.has(node.filePath)) continue
      for (const imp of node.imports) {
        if (!resultSet.has(imp)) continue
        const rel = relations.get(node.filePath)
        if (rel && !rel.imports.includes(imp)) {
          rel.imports.push(imp)
        }
        const impRel = relations.get(imp)
        if (impRel && !impRel.importedBy.includes(node.filePath)) {
          impRel.importedBy.push(node.filePath)
        }
      }
    }
  } catch {
    // Graph building may fail for non-code files; that's fine
  }

  return relations
}

// ---------------------------------------------------------------------------
// Module-to-file mapping
// ---------------------------------------------------------------------------

function findModuleForFile(
  filePath: string,
  structureMap: StructureMap | null,
): string | undefined {
  if (!structureMap) return undefined

  let bestMatch: string | undefined
  let bestLength = 0

  for (const mod of Object.values(structureMap.modules)) {
    if (
      (filePath.startsWith(mod.rootPath + '/') || filePath === mod.rootPath) &&
      mod.rootPath.length > bestLength
    ) {
      bestMatch = mod.id
      bestLength = mod.rootPath.length
    }
  }

  return bestMatch
}
