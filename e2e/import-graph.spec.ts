import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Create a temp project with known import relationships.
 *
 * Structure (6 files):
 *   src/index.ts   → imports ./utils, ./config
 *   src/utils.ts   → imports ./helpers
 *   src/config.ts  → no imports
 *   src/helpers.ts  → imports ./core
 *   src/core.ts    → imports ./base
 *   src/base.ts    → no imports
 *
 * With buildCodeGraph's default maxDepth=3, building from index.ts yields:
 *   depth 0: index.ts (processed)
 *   depth 1: utils.ts, config.ts (processed)
 *   depth 2: helpers.ts (processed → discovers core.ts)
 *   depth 3: core.ts (added but NOT processed — maxDepth reached)
 *
 * Initial graph: 5 files, 4 edges. core.ts is present but unexpanded.
 * Expanding core.ts reveals base.ts (6th file).
 */
function createTempProject(): string {
  const root = path.join(os.homedir(), 'smoke-e2e-test', `depgraph-${Date.now()}`)
  const src = path.join(root, 'src')
  fs.mkdirSync(src, { recursive: true })

  fs.writeFileSync(
    path.join(src, 'index.ts'),
    `import { formatName } from './utils'\nimport { getConfig } from './config'\n\nexport function main() {\n  const cfg = getConfig()\n  console.log(formatName(cfg.name))\n}\n`,
  )
  fs.writeFileSync(
    path.join(src, 'utils.ts'),
    `import { capitalize } from './helpers'\n\nexport function formatName(name: string): string {\n  return capitalize(name.trim())\n}\n`,
  )
  fs.writeFileSync(
    path.join(src, 'config.ts'),
    `export function getConfig() {\n  return { name: 'smoke', version: '1.0.0' }\n}\n`,
  )
  fs.writeFileSync(
    path.join(src, 'helpers.ts'),
    `import { toUpper } from './core'\n\nexport function capitalize(s: string): string {\n  return toUpper(s.charAt(0)) + s.slice(1)\n}\n`,
  )
  fs.writeFileSync(
    path.join(src, 'core.ts'),
    `import { identity } from './base'\n\nexport function toUpper(s: string): string {\n  return identity(s).toUpperCase()\n}\n`,
  )
  fs.writeFileSync(
    path.join(src, 'base.ts'),
    `export function identity<T>(x: T): T {\n  return x\n}\n`,
  )

  return root
}

/** Remove temp project directory tree. */
function cleanupTempProject(root: string): void {
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
}

/** Open a file in the viewer and set launchCwd, returning the session ID. */
async function openFileAndSetCwd(
  page: import('@playwright/test').Page,
  filePath: string,
  projectRoot: string,
  position: { x: number; y: number } = { x: 100, y: 100 },
): Promise<string> {
  return page.evaluate(
    ({ fp, root, pos }) => {
      return window.smokeAPI.fs.readfile(fp).then(({ content }) => {
        const stores = (window as any).__SMOKE_STORES__
        stores.preferencesStore.getState().setLaunchCwd(root)

        const session = stores.sessionStore.getState().createFileSession(
          fp, content, 'typescript', pos,
        )
        stores.sessionStore.getState().focusSession(session.id)
        return session.id
      })
    },
    { fp: filePath, root: projectRoot, pos: position },
  )
}

/** Get file viewer count from the session store (not DOM — avoids viewport culling). */
async function getFileSessionCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const stores = (window as any).__SMOKE_STORES__
    const sessions = stores.sessionStore.getState().sessions
    let count = 0
    for (const s of sessions.values()) {
      if (s.type === 'file') count++
    }
    return count
  })
}

/** Get all file viewer file paths from the session store. */
async function getFileViewerPaths(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const stores = (window as any).__SMOKE_STORES__
    const sessions = stores.sessionStore.getState().sessions
    const paths: string[] = []
    for (const s of sessions.values()) {
      if (s.type === 'file') paths.push(s.filePath)
    }
    return paths
  })
}

/** Get connector count from the store. */
async function getConnectorCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const stores = (window as any).__SMOKE_STORES__
    return stores.connectorStore.getState().connectors.size
  })
}

/** Clear all sessions and connectors for a clean slate between tests. */
async function clearAllSessions(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const stores = (window as any).__SMOKE_STORES__
    for (const id of stores.connectorStore.getState().connectors.keys()) {
      stores.connectorStore.getState().removeConnector(id)
    }
    for (const id of stores.sessionStore.getState().sessions.keys()) {
      stores.sessionStore.getState().removeSession(id)
    }
  })
}

/**
 * Zoom out the canvas viewport so all graph nodes are visible in the DOM.
 * Uses the proper canvas control functions that update refs, CSS transform,
 * and trigger the canvasStore → viewport culling recalculate chain.
 */
async function zoomOutToShowAll(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const stores = (window as any).__SMOKE_STORES__
    stores.canvasControls.setZoomTo(0.5)
    stores.canvasControls.setPanTo(0, 0)
  })
  // Wait for viewport culling debounce (100ms) + re-render
  await page.waitForTimeout(300)
}

/** Wait for a specific file session count in the store with polling. */
async function waitForFileSessionCount(
  page: import('@playwright/test').Page,
  expectedCount: number,
  timeout = 15000,
): Promise<void> {
  await page.waitForFunction(
    (count) => {
      const stores = (window as any).__SMOKE_STORES__
      const sessions = stores.sessionStore.getState().sessions
      let n = 0
      for (const s of sessions.values()) {
        if (s.type === 'file') n++
      }
      return n >= count
    },
    expectedCount,
    { timeout },
  )
}

const CONNECTOR_COLOR = '#4A90D9'

test.describe('Import Graph and Dependency Visualization', () => {
  let projectRoot: string

  test.beforeEach(() => {
    projectRoot = createTempProject()
  })

  test.afterEach(() => {
    cleanupTempProject(projectRoot)
  })

  test('Show Imports creates dependency file viewers with arrows', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const indexPath = path.join(projectRoot, 'src', 'index.ts')
    await openFileAndSetCwd(mainWindow, indexPath, projectRoot)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Click the "Imports" button on the root file viewer
    const importsBtn = fileWindow.first().locator('.file-viewer-imports-btn')
    await expect(importsBtn).toBeVisible({ timeout: 3000 })
    await importsBtn.click()

    // Wait for graph to materialize in the store (not DOM — viewport culling hides off-screen).
    // With maxDepth=3: index(0) → utils(1), config(1) → helpers(2) → core(3)
    // = 5 file sessions total
    await waitForFileSessionCount(mainWindow, 5)

    // Verify the dependency files appeared
    const filePaths = await getFileViewerPaths(mainWindow)
    const basenames = filePaths.map((fp) => path.basename(fp))
    expect(basenames).toContain('index.ts')
    expect(basenames).toContain('utils.ts')
    expect(basenames).toContain('config.ts')
    expect(basenames).toContain('helpers.ts')
    expect(basenames).toContain('core.ts')

    // 4 edges: index→utils, index→config, utils→helpers, helpers→core
    const connectors = await getConnectorCount(mainWindow)
    expect(connectors).toBe(4)

    // Verify SVG arrow connectors rendered with the correct color
    // (ConnectorLayer renders ALL connectors regardless of viewport culling)
    const connectorPaths = mainWindow.locator(`svg path[stroke="${CONNECTOR_COLOR}"]`)
    await expect(connectorPaths.first()).toBeAttached({ timeout: 5000 })

    // Verify connector paths have valid Bézier curve data
    const firstPath = await connectorPaths.first().getAttribute('d')
    expect(firstPath).toBeTruthy()
    expect(firstPath).toMatch(/^M .+ C .+/)

    // Verify connector labels exist (edge type labels)
    const labels = mainWindow.locator('svg text')
    const labelCount = await labels.count()
    expect(labelCount).toBeGreaterThanOrEqual(4)
  })

  test('click dependency to expand graph deeper', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const indexPath = path.join(projectRoot, 'src', 'index.ts')
    await openFileAndSetCwd(mainWindow, indexPath, projectRoot)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Build initial graph from index.ts (5 nodes with maxDepth=3)
    const importsBtn = fileWindow.first().locator('.file-viewer-imports-btn')
    await importsBtn.click()
    await waitForFileSessionCount(mainWindow, 5)

    // core.ts is at depth 3 — present but its imports were not expanded.
    // Trigger expand programmatically (core.ts may be off-screen due to viewport culling).
    const corePath = path.join(projectRoot, 'src', 'core.ts')
    await mainWindow.evaluate(async (fp) => {
      const stores = (window as any).__SMOKE_STORES__
      await stores.depgraph.expandDepGraph(fp)
    }, corePath)

    // After expanding core.ts, base.ts should appear (6 total)
    await waitForFileSessionCount(mainWindow, 6)

    // Verify base.ts is now in the graph
    const filePaths = await getFileViewerPaths(mainWindow)
    const basenames = filePaths.map((fp) => path.basename(fp))
    expect(basenames).toContain('base.ts')

    // Should now have 5 connectors (+1: core→base)
    const connectors = await getConnectorCount(mainWindow)
    expect(connectors).toBe(5)
  })

  test('Show Rdeps displays reverse dependencies', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    // Open helpers.ts — it's imported by utils.ts
    const helpersPath = path.join(projectRoot, 'src', 'helpers.ts')
    await openFileAndSetCwd(mainWindow, helpersPath, projectRoot)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Click the "Rdeps" button
    const rdepsBtn = fileWindow.first().locator('.file-viewer-edit-toggle', { hasText: 'Rdeps' })
    await expect(rdepsBtn).toBeVisible({ timeout: 3000 })
    await rdepsBtn.click()

    // utils.ts imports helpers.ts, so it should appear as a reverse dependency
    // Total: helpers.ts (root) + utils.ts (dependent) = 2
    await waitForFileSessionCount(mainWindow, 2)

    const filePaths = await getFileViewerPaths(mainWindow)
    const basenames = filePaths.map((fp) => path.basename(fp))
    expect(basenames).toContain('helpers.ts')
    expect(basenames).toContain('utils.ts')

    // Verify arrow connector exists (utils.ts → helpers.ts, inward-pointing)
    const connectors = await getConnectorCount(mainWindow)
    expect(connectors).toBe(1)

    const connectorPath = mainWindow.locator(`svg path[stroke="${CONNECTOR_COLOR}"]`)
    await expect(connectorPath).toBeAttached({ timeout: 5000 })
  })

  test('graph layout positions files logically by depth', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const indexPath = path.join(projectRoot, 'src', 'index.ts')
    await openFileAndSetCwd(mainWindow, indexPath, projectRoot)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Build import graph
    const importsBtn = fileWindow.first().locator('.file-viewer-imports-btn')
    await importsBtn.click()
    await waitForFileSessionCount(mainWindow, 5)

    // Wait for layout animation to complete
    await mainWindow.waitForTimeout(500)

    // Get positions of all file viewers from the session store
    const positions = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const sessions = stores.sessionStore.getState().sessions
      const result: Array<{ path: string; x: number; y: number }> = []
      for (const s of sessions.values()) {
        if (s.type === 'file') {
          result.push({
            path: s.filePath,
            x: s.position.x,
            y: s.position.y,
          })
        }
      }
      return result
    })

    expect(positions).toHaveLength(5)

    // Layout engine places nodes by BFS depth in columns (720px apart):
    // depth 0: index.ts (root, leftmost)
    // depth 1: utils.ts, config.ts
    // depth 2: helpers.ts
    // depth 3: core.ts (rightmost)
    const indexPos = positions.find((p) => p.path.endsWith('index.ts'))!
    const utilsPos = positions.find((p) => p.path.endsWith('utils.ts'))!
    const configPos = positions.find((p) => p.path.endsWith('config.ts'))!
    const helpersPos = positions.find((p) => p.path.endsWith('helpers.ts'))!
    const corePos = positions.find((p) => p.path.endsWith('core.ts'))!

    expect(indexPos).toBeDefined()
    expect(utilsPos).toBeDefined()
    expect(configPos).toBeDefined()
    expect(helpersPos).toBeDefined()
    expect(corePos).toBeDefined()

    // Each deeper depth should be further to the right
    expect(utilsPos.x).toBeGreaterThan(indexPos.x)
    expect(configPos.x).toBeGreaterThan(indexPos.x)
    expect(helpersPos.x).toBeGreaterThan(utilsPos.x)
    expect(corePos.x).toBeGreaterThan(helpersPos.x)

    // Same-depth nodes should share the same x coordinate
    expect(utilsPos.x).toBe(configPos.x)

    // Same-depth nodes should be vertically separated
    expect(utilsPos.y).not.toBe(configPos.y)
  })

  test('connectors cleaned up when graph node is closed', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const indexPath = path.join(projectRoot, 'src', 'index.ts')
    await openFileAndSetCwd(mainWindow, indexPath, projectRoot)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Build import graph
    const importsBtn = fileWindow.first().locator('.file-viewer-imports-btn')
    await importsBtn.click()
    await waitForFileSessionCount(mainWindow, 5)

    // Should have 4 connectors initially
    let connectors = await getConnectorCount(mainWindow)
    expect(connectors).toBe(4)

    // Close config.ts via the session store (avoids needing it visible in viewport)
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const sessions = stores.sessionStore.getState().sessions
      for (const [id, s] of sessions) {
        if (s.type === 'file' && s.filePath.endsWith('config.ts')) {
          stores.sessionStore.getState().removeSession(id)
          break
        }
      }
    })

    await mainWindow.waitForTimeout(300)

    // The connector to config.ts should be cleaned up
    connectors = await getConnectorCount(mainWindow)
    expect(connectors).toBe(3)

    // Verify file count decreased
    const fileCount = await getFileSessionCount(mainWindow)
    expect(fileCount).toBe(4)
  })
})
