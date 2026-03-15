import { describe, it, expect } from 'vitest'
import {
  computeWorkspaceLayout,
  type WorkspaceFile,
} from '../WorkspaceLayoutPlanner'

function makeFile(
  filePath: string,
  relevance: number,
  imports: string[] = [],
  importedBy: string[] = []
): WorkspaceFile {
  return { filePath, relevance, imports, importedBy }
}

describe('computeWorkspaceLayout', () => {
  it('returns empty result for empty input', () => {
    const result = computeWorkspaceLayout([])
    expect(result.positions).toHaveLength(0)
    expect(result.arrows).toHaveLength(0)
    expect(result.regions).toHaveLength(0)
  })

  it('places a single primary file at origin', () => {
    const files = [makeFile('/src/app.ts', 1.0)]
    const result = computeWorkspaceLayout(files)

    expect(result.positions).toHaveLength(1)
    expect(result.positions[0].x).toBe(0)
    expect(result.positions[0].y).toBe(0)
  })

  it('places primary files in center column sorted by relevance', () => {
    const files = [
      makeFile('/src/a.ts', 0.8),
      makeFile('/src/b.ts', 1.0),
      makeFile('/src/c.ts', 0.9),
    ]
    const result = computeWorkspaceLayout(files)

    // All at x=0 (center column)
    for (const pos of result.positions) {
      expect(pos.x).toBe(0)
    }

    // Sorted by relevance descending: b (1.0), c (0.9), a (0.8)
    expect(result.positions[0].filePath).toBe('/src/b.ts')
    expect(result.positions[1].filePath).toBe('/src/c.ts')
    expect(result.positions[2].filePath).toBe('/src/a.ts')
  })

  it('places upstream dependencies to the left of primary files', () => {
    const files = [
      makeFile('/src/app.ts', 1.0, ['/src/utils.ts'], []),
      makeFile('/src/utils.ts', 0.3, [], ['/src/app.ts']),
    ]
    const result = computeWorkspaceLayout(files)

    const appPos = result.positions.find((p) => p.filePath === '/src/app.ts')!
    const utilsPos = result.positions.find((p) => p.filePath === '/src/utils.ts')!

    expect(appPos.x).toBe(0) // primary → center
    expect(utilsPos.x).toBeLessThan(appPos.x) // upstream → left
  })

  it('places downstream consumers to the right of primary files', () => {
    const files = [
      makeFile('/src/core.ts', 1.0, [], ['/src/page.ts']),
      makeFile('/src/page.ts', 0.3, ['/src/core.ts'], []),
    ]
    const result = computeWorkspaceLayout(files)

    const corePos = result.positions.find((p) => p.filePath === '/src/core.ts')!
    const pagePos = result.positions.find((p) => p.filePath === '/src/page.ts')!

    expect(corePos.x).toBe(0) // primary → center
    expect(pagePos.x).toBeGreaterThan(corePos.x) // downstream → right
  })

  it('places test files below their source files', () => {
    const files = [
      makeFile('/src/foo/bar.ts', 1.0),
      makeFile('/src/foo/__tests__/bar.test.ts', 0.5, ['/src/foo/bar.ts'], []),
    ]
    const result = computeWorkspaceLayout(files)

    const sourcePos = result.positions.find((p) => p.filePath === '/src/foo/bar.ts')!
    const testPos = result.positions.find((p) => p.filePath === '/src/foo/__tests__/bar.test.ts')!

    expect(testPos.x).toBe(sourcePos.x) // same column
    expect(testPos.y).toBeGreaterThan(sourcePos.y) // below
  })

  it('places config files in top-right corner', () => {
    const files = [
      makeFile('/src/app.ts', 1.0),
      makeFile('/tsconfig.json', 0.1),
      makeFile('/package.json', 0.1),
    ]
    const result = computeWorkspaceLayout(files)

    const appPos = result.positions.find((p) => p.filePath === '/src/app.ts')!
    const tsconfigPos = result.positions.find((p) => p.filePath === '/tsconfig.json')!
    const pkgPos = result.positions.find((p) => p.filePath === '/package.json')!

    // Config files should be to the right
    expect(tsconfigPos.x).toBeGreaterThan(appPos.x)
    expect(pkgPos.x).toBeGreaterThan(appPos.x)

    // Config files should be above or at the top
    expect(tsconfigPos.y).toBeLessThanOrEqual(appPos.y)
    expect(pkgPos.y).toBeLessThanOrEqual(appPos.y)
  })

  it('generates arrows for import edges between included files', () => {
    const files = [
      makeFile('/src/a.ts', 1.0, ['/src/b.ts'], []),
      makeFile('/src/b.ts', 0.5, [], ['/src/a.ts']),
    ]
    const result = computeWorkspaceLayout(files)

    expect(result.arrows).toHaveLength(1)
    expect(result.arrows[0]).toEqual({
      from: '/src/a.ts',
      to: '/src/b.ts',
      type: 'import',
    })
  })

  it('does not generate arrows for files not in the set', () => {
    const files = [
      makeFile('/src/a.ts', 1.0, ['/src/b.ts', '/external/lib.ts'], []),
      makeFile('/src/b.ts', 0.5, [], ['/src/a.ts']),
    ]
    const result = computeWorkspaceLayout(files)

    // Only the edge to /src/b.ts should exist (not /external/lib.ts)
    expect(result.arrows).toHaveLength(1)
    expect(result.arrows[0].to).toBe('/src/b.ts')
  })

  it('generates regions for module groups with 2+ files', () => {
    const files = [
      makeFile('/src/utils/a.ts', 1.0),
      makeFile('/src/utils/b.ts', 0.8),
      makeFile('/src/other/c.ts', 0.5),
    ]
    const result = computeWorkspaceLayout(files)

    // /src/utils/ has 2 files → should get a region
    const utilsRegion = result.regions.find((r) => r.name === 'utils')
    expect(utilsRegion).toBeDefined()

    // /src/other/ has only 1 file → no region
    const otherRegion = result.regions.find((r) => r.name === 'other')
    expect(otherRegion).toBeUndefined()
  })

  it('region boundaries enclose all files in the group', () => {
    const files = [
      makeFile('/src/mod/a.ts', 1.0),
      makeFile('/src/mod/b.ts', 0.8),
    ]
    const result = computeWorkspaceLayout(files, { regionPadding: 40 })

    const region = result.regions.find((r) => r.name === 'mod')!
    const posA = result.positions.find((p) => p.filePath === '/src/mod/a.ts')!
    const posB = result.positions.find((p) => p.filePath === '/src/mod/b.ts')!

    // Region should enclose both files
    expect(region.position.x).toBeLessThanOrEqual(Math.min(posA.x, posB.x))
    expect(region.position.y).toBeLessThanOrEqual(Math.min(posA.y, posB.y))
  })

  it('promotes highest-relevance file to primary when none exceed threshold', () => {
    const files = [
      makeFile('/src/a.ts', 0.3),
      makeFile('/src/b.ts', 0.5),
      makeFile('/src/c.ts', 0.4),
    ]
    const result = computeWorkspaceLayout(files)

    // b.ts (0.5) should be promoted to primary → at center
    const posB = result.positions.find((p) => p.filePath === '/src/b.ts')!
    expect(posB.x).toBe(0)
  })

  it('handles multi-level upstream chains', () => {
    const files = [
      makeFile('/src/app.ts', 1.0, ['/src/service.ts'], []),
      makeFile('/src/service.ts', 0.4, ['/src/repo.ts'], ['/src/app.ts']),
      makeFile('/src/repo.ts', 0.2, [], ['/src/service.ts']),
    ]
    const result = computeWorkspaceLayout(files)

    const appPos = result.positions.find((p) => p.filePath === '/src/app.ts')!
    const servicePos = result.positions.find((p) => p.filePath === '/src/service.ts')!
    const repoPos = result.positions.find((p) => p.filePath === '/src/repo.ts')!

    // app at center, service one column left, repo two columns left
    expect(appPos.x).toBe(0)
    expect(servicePos.x).toBeLessThan(appPos.x)
    expect(repoPos.x).toBeLessThan(servicePos.x)
  })

  it('respects custom layout options', () => {
    const files = [
      makeFile('/src/a.ts', 1.0, ['/src/b.ts'], []),
      makeFile('/src/b.ts', 0.3, [], ['/src/a.ts']),
    ]
    const result = computeWorkspaceLayout(files, { horizontalSpacing: 1000 })

    const posA = result.positions.find((p) => p.filePath === '/src/a.ts')!
    const posB = result.positions.find((p) => p.filePath === '/src/b.ts')!

    expect(posA.x - posB.x).toBe(1000) // spacing between columns
  })

  it('handles .spec. test files', () => {
    const files = [
      makeFile('/src/utils.ts', 1.0),
      makeFile('/src/utils.spec.ts', 0.5, ['/src/utils.ts'], []),
    ]
    const result = computeWorkspaceLayout(files)

    const sourcePos = result.positions.find((p) => p.filePath === '/src/utils.ts')!
    const testPos = result.positions.find((p) => p.filePath === '/src/utils.spec.ts')!

    expect(testPos.y).toBeGreaterThan(sourcePos.y)
  })

  it('test file falls back to import-based source matching', () => {
    // Test file that doesn't match source by name but imports it
    const files = [
      makeFile('/src/core/engine.ts', 1.0),
      makeFile('/tests/integration/engine.test.ts', 0.5, ['/src/core/engine.ts'], []),
    ]
    const result = computeWorkspaceLayout(files)

    const sourcePos = result.positions.find((p) => p.filePath === '/src/core/engine.ts')!
    const testPos = result.positions.find((p) => p.filePath === '/tests/integration/engine.test.ts')!

    // Test should be placed below its imported source
    expect(testPos.x).toBe(sourcePos.x)
    expect(testPos.y).toBeGreaterThan(sourcePos.y)
  })

  it('computes correct bounds encompassing all positions', () => {
    const files = [
      makeFile('/src/a.ts', 1.0, ['/src/b.ts'], ['/src/c.ts']),
      makeFile('/src/b.ts', 0.3, [], ['/src/a.ts']),
      makeFile('/src/c.ts', 0.3, ['/src/a.ts'], []),
    ]
    const result = computeWorkspaceLayout(files)

    for (const pos of result.positions) {
      expect(pos.x).toBeGreaterThanOrEqual(result.bounds.minX)
      expect(pos.y).toBeGreaterThanOrEqual(result.bounds.minY)
      expect(pos.x + 640).toBeLessThanOrEqual(result.bounds.maxX) // default nodeWidth
      expect(pos.y + 480).toBeLessThanOrEqual(result.bounds.maxY) // default nodeHeight
    }
  })

  it('full scenario: mixed file types with data flow', () => {
    const files = [
      // Primary
      makeFile('/src/api/handler.ts', 0.95, ['/src/api/service.ts'], ['/src/api/router.ts']),
      makeFile('/src/api/service.ts', 0.85, ['/src/db/repo.ts'], ['/src/api/handler.ts']),
      // Upstream dependency
      makeFile('/src/db/repo.ts', 0.3, [], ['/src/api/service.ts']),
      // Downstream consumer
      makeFile('/src/api/router.ts', 0.4, ['/src/api/handler.ts'], []),
      // Test file
      makeFile('/src/api/__tests__/handler.test.ts', 0.5, ['/src/api/handler.ts'], []),
      // Config
      makeFile('/tsconfig.json', 0.1),
    ]

    const result = computeWorkspaceLayout(files)

    // All 6 files should be positioned
    expect(result.positions).toHaveLength(6)

    // No duplicate positions
    const paths = result.positions.map((p) => p.filePath)
    expect(new Set(paths).size).toBe(6)

    // Primary files at center
    const handlerPos = result.positions.find((p) => p.filePath === '/src/api/handler.ts')!
    const servicePos = result.positions.find((p) => p.filePath === '/src/api/service.ts')!
    expect(handlerPos.x).toBe(0)
    expect(servicePos.x).toBe(0)

    // Upstream to the left
    const repoPos = result.positions.find((p) => p.filePath === '/src/db/repo.ts')!
    expect(repoPos.x).toBeLessThan(0)

    // Downstream to the right
    const routerPos = result.positions.find((p) => p.filePath === '/src/api/router.ts')!
    expect(routerPos.x).toBeGreaterThan(0)

    // Test below source
    const testPos = result.positions.find((p) => p.filePath === '/src/api/__tests__/handler.test.ts')!
    expect(testPos.y).toBeGreaterThan(handlerPos.y)

    // Config in top-right area
    const configPos = result.positions.find((p) => p.filePath === '/tsconfig.json')!
    expect(configPos.x).toBeGreaterThan(0)

    // Arrows exist
    expect(result.arrows.length).toBeGreaterThan(0)

    // Region for /src/api/ (handler, service, router = 3 files)
    const apiRegion = result.regions.find((r) => r.name === 'api')
    expect(apiRegion).toBeDefined()
  })
})
