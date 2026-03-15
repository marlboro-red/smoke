/**
 * Workspace layout planner: spatial arrangement by data flow (smoke-phq.4).
 *
 * Given files with import relationships and relevance scores, computes a
 * spatial layout that reflects data flow and logical grouping:
 *
 * - Primary files (highest relevance) → center column
 * - Upstream dependencies → left columns
 * - Downstream consumers → right columns
 * - Test files → below their source files
 * - Config files → top-right corner cluster
 *
 * Extends the hierarchical layout engine (smoke-mib.4) with task-aware heuristics.
 */

import type { NodePosition, LayoutOptions } from './layoutEngine'

// ── Input types ──

export interface WorkspaceFile {
  filePath: string
  relevance: number            // 0–1, higher = more relevant to the task
  imports: string[]            // file paths this file imports
  importedBy: string[]         // file paths that import this file
}

export interface WorkspaceLayoutOptions {
  /** Horizontal spacing between depth columns (px). Default: 720 */
  horizontalSpacing?: number
  /** Vertical spacing between sibling nodes (px). Default: 200 */
  verticalSpacing?: number
  /** Node width for bounds and region calculation (px). Default: 640 */
  nodeWidth?: number
  /** Node height for bounds and region calculation (px). Default: 480 */
  nodeHeight?: number
  /** Relevance threshold for "primary" files. Default: 0.7 */
  primaryThreshold?: number
  /** Padding around region boundaries (px). Default: 40 */
  regionPadding?: number
}

// ── Output types ──

export interface WorkspaceArrow {
  from: string   // filePath
  to: string     // filePath
  type: 'import' | 'require' | 'use'
}

export interface WorkspaceRegion {
  name: string
  position: { x: number; y: number }
  size: { width: number; height: number }
}

export interface WorkspaceLayoutResult {
  positions: NodePosition[]
  arrows: WorkspaceArrow[]
  regions: WorkspaceRegion[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

// ── File classification ──

type FileCategory = 'primary' | 'upstream' | 'downstream' | 'test' | 'config'

const TEST_PATTERNS = [
  /__tests__\//,
  /\.test\./,
  /\.spec\./,
  /test\//i,
  /tests\//i,
]

const CONFIG_PATTERNS = [
  /tsconfig/,
  /package\.json$/,
  /\.eslintrc/,
  /\.prettierrc/,
  /vite\.config/,
  /vitest\.config/,
  /webpack\.config/,
  /jest\.config/,
  /babel\.config/,
  /\.babelrc/,
  /tailwind\.config/,
  /postcss\.config/,
  /next\.config/,
  /\.env/,
  /Makefile$/,
  /Dockerfile$/,
  /docker-compose/,
]

function isTestFile(filePath: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(filePath))
}

function isConfigFile(filePath: string): boolean {
  const basename = filePath.split('/').pop() ?? filePath
  return CONFIG_PATTERNS.some((p) => p.test(basename))
}

/**
 * Find the source file path that a test file corresponds to.
 * e.g., `/src/foo/__tests__/bar.test.ts` → `/src/foo/bar.ts`
 */
function getTestSourcePath(testPath: string): string | null {
  const parts = testPath.split('/')
  const filename = parts.pop() ?? ''

  // Strip test suffixes: foo.test.ts → foo.ts, foo.spec.tsx → foo.tsx
  const stripped = filename
    .replace(/\.test\./, '.')
    .replace(/\.spec\./, '.')

  // If in __tests__ directory, go up one level
  const testDirIdx = parts.lastIndexOf('__tests__')
  if (testDirIdx >= 0) {
    const parentParts = parts.slice(0, testDirIdx)
    return [...parentParts, stripped].join('/')
  }

  // If in tests/ directory, try sibling src/ or same parent
  const testsIdx = parts.findIndex((p) => p.toLowerCase() === 'tests' || p.toLowerCase() === 'test')
  if (testsIdx >= 0) {
    const parentParts = parts.slice(0, testsIdx)
    return [...parentParts, 'src', stripped].join('/')
  }

  // Same directory, just strip the suffix
  return [...parts, stripped].join('/')
}

// ── Defaults ──

const DEFAULTS: Required<WorkspaceLayoutOptions> = {
  horizontalSpacing: 720,
  verticalSpacing: 200,
  nodeWidth: 640,
  nodeHeight: 480,
  primaryThreshold: 0.7,
  regionPadding: 40,
}

// ── Main layout function ──

/**
 * Compute a workspace layout with data-flow-aware positioning.
 *
 * Algorithm:
 * 1. Classify files into primary, upstream, downstream, test, config
 * 2. Place primary files in center column (x=0), sorted by relevance desc
 * 3. BFS from primary files along import edges → upstream columns (negative x)
 * 4. BFS from primary files along importedBy edges → downstream columns (positive x)
 * 5. Place test files below their corresponding source files
 * 6. Cluster config files in top-right corner
 * 7. Derive region boundaries from module groups
 */
export function computeWorkspaceLayout(
  files: WorkspaceFile[],
  options: WorkspaceLayoutOptions = {}
): WorkspaceLayoutResult {
  const opts = { ...DEFAULTS, ...options }

  if (files.length === 0) {
    return {
      positions: [],
      arrows: [],
      regions: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    }
  }

  // Build lookup maps
  const fileMap = new Map<string, WorkspaceFile>()
  for (const f of files) {
    fileMap.set(f.filePath, f)
  }

  // Step 1: Classify files
  const categories = classifyFiles(files, fileMap, opts.primaryThreshold)

  // Step 2–6: Position files
  const positioned = new Map<string, NodePosition>()

  // Place primary files at center column (depth 0 = x offset 0)
  const primaryFiles = categories.get('primary') ?? []
  primaryFiles.sort((a, b) => {
    const ra = fileMap.get(a)?.relevance ?? 0
    const rb = fileMap.get(b)?.relevance ?? 0
    return rb - ra // descending relevance
  })
  placeColumn(primaryFiles, 0, 0, opts, positioned)

  // BFS upstream: follow imports from primary files (left, negative columns)
  const upstreamFiles = categories.get('upstream') ?? []
  if (upstreamFiles.length > 0) {
    const upstreamColumns = bfsColumns(primaryFiles, fileMap, 'imports', new Set(upstreamFiles))
    for (const [depth, column] of upstreamColumns) {
      const colX = -(depth + 1) // negative columns for upstream
      placeColumn(column, colX, 0, opts, positioned)
    }
  }

  // BFS downstream: follow importedBy from primary files (right, positive columns)
  const downstreamFiles = categories.get('downstream') ?? []
  if (downstreamFiles.length > 0) {
    const downstreamColumns = bfsColumns(primaryFiles, fileMap, 'importedBy', new Set(downstreamFiles))
    for (const [depth, column] of downstreamColumns) {
      const colX = depth + 1 // positive columns for downstream
      placeColumn(column, colX, 0, opts, positioned)
    }
  }

  // Place test files below their source files
  const testFiles = categories.get('test') ?? []
  placeTestFiles(testFiles, fileMap, opts, positioned)

  // Place config files in top-right corner
  const configFiles = categories.get('config') ?? []
  if (configFiles.length > 0) {
    placeConfigFiles(configFiles, opts, positioned)
  }

  // Build positions array
  const positions = Array.from(positioned.values())

  // Build arrows from edges between included files
  const arrows = buildArrows(files, fileMap)

  // Build regions from module groups
  const regions = buildRegions(positions, opts)

  // Compute bounds
  const bounds = computeBounds(positions, opts.nodeWidth, opts.nodeHeight)

  return { positions, arrows, regions, bounds }
}

// ── Classification ──

function classifyFiles(
  files: WorkspaceFile[],
  fileMap: Map<string, WorkspaceFile>,
  primaryThreshold: number
): Map<FileCategory, string[]> {
  const result = new Map<FileCategory, string[]>()
  for (const cat of ['primary', 'upstream', 'downstream', 'test', 'config'] as FileCategory[]) {
    result.set(cat, [])
  }

  // First pass: identify test and config files
  const testPaths = new Set<string>()
  const configPaths = new Set<string>()

  for (const f of files) {
    if (isTestFile(f.filePath)) {
      testPaths.add(f.filePath)
    } else if (isConfigFile(f.filePath)) {
      configPaths.add(f.filePath)
    }
  }

  // Second pass: classify remaining files
  const primaryPaths = new Set<string>()

  for (const f of files) {
    if (testPaths.has(f.filePath)) {
      result.get('test')!.push(f.filePath)
      continue
    }
    if (configPaths.has(f.filePath)) {
      result.get('config')!.push(f.filePath)
      continue
    }

    if (f.relevance >= primaryThreshold) {
      result.get('primary')!.push(f.filePath)
      primaryPaths.add(f.filePath)
    }
  }

  // If no primary files, promote the top file by relevance
  if (primaryPaths.size === 0) {
    const nonSpecial = files.filter((f) => !testPaths.has(f.filePath) && !configPaths.has(f.filePath))
    if (nonSpecial.length > 0) {
      nonSpecial.sort((a, b) => b.relevance - a.relevance)
      const top = nonSpecial[0]
      result.get('primary')!.push(top.filePath)
      primaryPaths.add(top.filePath)
    }
  }

  // Third pass: upstream/downstream for non-primary, non-test, non-config files
  for (const f of files) {
    if (primaryPaths.has(f.filePath) || testPaths.has(f.filePath) || configPaths.has(f.filePath)) {
      continue
    }

    // Is this file imported by any primary file? → upstream dependency
    const isUpstream = f.importedBy.some((p) => primaryPaths.has(p))
    // Does this file import any primary file? → downstream consumer
    const isDownstream = f.imports.some((p) => primaryPaths.has(p))

    if (isUpstream && !isDownstream) {
      result.get('upstream')!.push(f.filePath)
    } else if (isDownstream && !isUpstream) {
      result.get('downstream')!.push(f.filePath)
    } else if (isUpstream && isDownstream) {
      // Both: put in whichever has stronger connection (default upstream)
      result.get('upstream')!.push(f.filePath)
    } else {
      // No direct connection to primary — use BFS distance or relevance
      // Heuristic: if it imports more than it's imported-by, likely upstream
      const importsInSet = f.imports.filter((p) => fileMap.has(p)).length
      const importedByInSet = f.importedBy.filter((p) => fileMap.has(p)).length
      if (importedByInSet >= importsInSet) {
        result.get('upstream')!.push(f.filePath)
      } else {
        result.get('downstream')!.push(f.filePath)
      }
    }
  }

  return result
}

// ── Positioning helpers ──

function placeColumn(
  filePaths: string[],
  column: number,
  originY: number,
  opts: Required<WorkspaceLayoutOptions>,
  positioned: Map<string, NodePosition>
): void {
  const x = column * opts.horizontalSpacing
  const totalHeight = (filePaths.length - 1) * opts.verticalSpacing
  const startY = originY - totalHeight / 2

  for (let i = 0; i < filePaths.length; i++) {
    if (positioned.has(filePaths[i])) continue
    positioned.set(filePaths[i], {
      filePath: filePaths[i],
      x,
      y: startY + i * opts.verticalSpacing,
      depth: column,
    })
  }
}

/**
 * BFS from source nodes along a direction ('imports' or 'importedBy')
 * to build depth-grouped columns of target nodes.
 */
function bfsColumns(
  sourcePaths: string[],
  fileMap: Map<string, WorkspaceFile>,
  direction: 'imports' | 'importedBy',
  allowedSet: Set<string>
): Map<number, string[]> {
  const visited = new Set<string>(sourcePaths)
  const columns = new Map<number, string[]>()
  let frontier = [...sourcePaths]
  let depth = 0

  while (frontier.length > 0) {
    const nextFrontier: string[] = []

    for (const path of frontier) {
      const file = fileMap.get(path)
      if (!file) continue

      const neighbors = file[direction]
      for (const neighbor of neighbors) {
        if (visited.has(neighbor) || !allowedSet.has(neighbor)) continue
        visited.add(neighbor)

        if (!columns.has(depth)) {
          columns.set(depth, [])
        }
        columns.get(depth)!.push(neighbor)
        nextFrontier.push(neighbor)
      }
    }

    frontier = nextFrontier
    depth++
  }

  return columns
}

function placeTestFiles(
  testPaths: string[],
  fileMap: Map<string, WorkspaceFile>,
  opts: Required<WorkspaceLayoutOptions>,
  positioned: Map<string, NodePosition>
): void {
  // Group test files by their source file
  const placed = new Set<string>()

  for (const testPath of testPaths) {
    const sourcePath = getTestSourcePath(testPath)

    // Try to find the source file's position
    let sourcePos: NodePosition | undefined
    if (sourcePath) {
      sourcePos = positioned.get(sourcePath)
    }

    // Fallback: check if the test file imports any positioned file
    if (!sourcePos) {
      const testFile = fileMap.get(testPath)
      if (testFile) {
        for (const imp of testFile.imports) {
          const pos = positioned.get(imp)
          if (pos) {
            sourcePos = pos
            break
          }
        }
      }
    }

    if (sourcePos) {
      // Place below the source file
      // Count how many tests are already placed below this source
      let offset = 1
      for (const p of placed) {
        const pp = positioned.get(p)
        if (pp && pp.x === sourcePos.x && pp.y > sourcePos.y) {
          offset++
        }
      }

      positioned.set(testPath, {
        filePath: testPath,
        x: sourcePos.x,
        y: sourcePos.y + offset * opts.verticalSpacing,
        depth: sourcePos.depth,
      })
      placed.add(testPath)
    }
  }

  // Place any remaining unplaced test files in a test column to the right
  const unplaced = testPaths.filter((p) => !placed.has(p))
  if (unplaced.length > 0) {
    // Find the rightmost column
    let maxCol = 0
    for (const pos of positioned.values()) {
      const col = Math.round(pos.x / opts.horizontalSpacing)
      maxCol = Math.max(maxCol, col)
    }

    placeColumn(unplaced, maxCol + 1, opts.verticalSpacing, opts, positioned)
  }
}

function placeConfigFiles(
  configPaths: string[],
  opts: Required<WorkspaceLayoutOptions>,
  positioned: Map<string, NodePosition>
): void {
  // Find the top-right corner: max x, min y
  let maxCol = 0
  let minY = 0

  for (const pos of positioned.values()) {
    const col = Math.round(pos.x / opts.horizontalSpacing)
    maxCol = Math.max(maxCol, col)
    minY = Math.min(minY, pos.y)
  }

  // Place config files above and to the right
  const configCol = maxCol + 1
  const configStartY = minY - opts.verticalSpacing
  const x = configCol * opts.horizontalSpacing

  for (let i = 0; i < configPaths.length; i++) {
    positioned.set(configPaths[i], {
      filePath: configPaths[i],
      x,
      y: configStartY - (configPaths.length - 1 - i) * opts.verticalSpacing,
      depth: configCol,
    })
  }
}

// ── Arrows ──

function buildArrows(
  files: WorkspaceFile[],
  fileMap: Map<string, WorkspaceFile>
): WorkspaceArrow[] {
  const arrows: WorkspaceArrow[] = []
  const seen = new Set<string>()

  for (const file of files) {
    for (const imp of file.imports) {
      if (!fileMap.has(imp)) continue
      const key = `${file.filePath}→${imp}`
      if (seen.has(key)) continue
      seen.add(key)
      arrows.push({ from: file.filePath, to: imp, type: 'import' })
    }
  }

  return arrows
}

// ── Regions ──

function buildRegions(
  positions: NodePosition[],
  opts: Required<WorkspaceLayoutOptions>
): WorkspaceRegion[] {
  // Group positions by module (parent directory)
  const groups = new Map<string, NodePosition[]>()

  for (const pos of positions) {
    const parts = pos.filePath.split('/')
    parts.pop() // remove filename
    const moduleDir = parts.join('/') || '/'

    if (!groups.has(moduleDir)) {
      groups.set(moduleDir, [])
    }
    groups.get(moduleDir)!.push(pos)
  }

  const regions: WorkspaceRegion[] = []
  const pad = opts.regionPadding

  for (const [dir, groupPositions] of groups) {
    // Skip single-file groups — regions are only meaningful for 2+ files
    if (groupPositions.length < 2) continue

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const pos of groupPositions) {
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + opts.nodeWidth)
      maxY = Math.max(maxY, pos.y + opts.nodeHeight)
    }

    // Extract a clean name from the directory path
    const dirParts = dir.split('/')
    const name = dirParts[dirParts.length - 1] || dir

    regions.push({
      name,
      position: { x: minX - pad, y: minY - pad },
      size: {
        width: maxX - minX + 2 * pad,
        height: maxY - minY + 2 * pad,
      },
    })
  }

  return regions
}

// ── Bounds ──

function computeBounds(
  positions: NodePosition[],
  nodeWidth: number,
  nodeHeight: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (positions.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of positions) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + nodeWidth)
    maxY = Math.max(maxY, p.y + nodeHeight)
  }
  return { minX, minY, maxX, maxY }
}
