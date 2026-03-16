import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Create a temp file under ~/smoke-e2e-test/.
 * Required because Smoke's fs IPC rejects paths outside ~.
 */
function createTempFile(name: string, content: string): string {
  const dir = path.join(os.homedir(), 'smoke-e2e-test', `ghost-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

/** Remove temp file and its parent directory */
function cleanupTempFiles(...filePaths: string[]): void {
  const dirs = new Set<string>()
  for (const fp of filePaths) {
    try {
      fs.unlinkSync(fp)
      dirs.add(path.dirname(fp))
    } catch {
      // ignore
    }
  }
  for (const dir of dirs) {
    try {
      fs.rmdirSync(dir)
    } catch {
      // ignore
    }
  }
}

/** Open a file in the file viewer and focus it */
async function openFileViewer(
  page: import('@playwright/test').Page,
  filePath: string
): Promise<string> {
  return page.evaluate((fp) => {
    return window.smokeAPI.fs.readfile(fp).then(({ content }) => {
      const store = (window as any).__SMOKE_STORES__?.sessionStore
      if (store) {
        const session = store.getState().createFileSession(fp, content, 'typescript')
        store.getState().focusSession(session.id)
        return session.id as string
      }
      return ''
    })
  }, filePath)
}

/**
 * Inject ghost suggestions directly into the suggestion store.
 * This avoids depending on the codegraph IPC which requires a real project.
 */
async function injectGhostSuggestions(
  page: import('@playwright/test').Page,
  suggestions: Array<{
    id: string
    filePath: string
    displayName: string
    relevanceScore: number
    reason: 'import' | 'dependent' | 'keyword'
    position: { x: number; y: number }
  }>,
  sourceFilePath: string
): Promise<void> {
  await page.evaluate(
    ([suggs, srcPath]) => {
      const store = (window as any).__SMOKE_STORES__?.suggestionStore
      if (store) {
        store.getState().setEnabled(true)
        store.getState().setSuggestions(suggs, srcPath)
      }
    },
    [suggestions, sourceFilePath] as const
  )
}

test.describe('Ghost Suggestions: Appearance and Materialization', () => {
  let sourceFile: string
  let targetFile: string

  test.beforeEach(() => {
    sourceFile = createTempFile(
      'source.ts',
      'import { helper } from "./helper";\nconsole.log(helper());\n'
    )
    targetFile = createTempFile(
      'helper.ts',
      'export function helper(): string {\n  return "hello from helper";\n}\n'
    )
  })

  test.afterEach(() => {
    cleanupTempFiles(sourceFile, targetFile)
  })

  test('ghost suggestion elements appear as faded previews', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open a file to act as the source
    await openFileViewer(mainWindow, sourceFile)
    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Inject ghost suggestions into the store
    await injectGhostSuggestions(
      mainWindow,
      [
        {
          id: 'ghost-helper-ts',
          filePath: targetFile,
          displayName: 'helper.ts',
          relevanceScore: 0.9,
          reason: 'import',
          position: { x: 800, y: 300 },
        },
      ],
      sourceFile
    )

    // Ghost suggestion element should appear on canvas
    const ghost = mainWindow.locator('.ghost-suggestion')
    await expect(ghost.first()).toBeVisible({ timeout: 5000 })

    // Verify ghost has faded appearance (opacity < 1 via CSS)
    const opacity = await ghost.first().evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).opacity)
    })
    expect(opacity).toBeLessThan(1)

    // Verify ghost displays the filename
    const filename = ghost.first().locator('.ghost-suggestion-filename')
    await expect(filename).toHaveText('helper.ts')

    // Verify reason label is shown
    const reason = ghost.first().locator('.ghost-suggestion-reason')
    await expect(reason).toHaveText('imports')

    // Verify relevance bar exists
    const relevanceBar = ghost.first().locator('.ghost-suggestion-relevance-bar')
    await expect(relevanceBar).toBeVisible()
  })

  test('ghost suggestion shows correct reason labels for each type', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openFileViewer(mainWindow, sourceFile)
    await expect(mainWindow.locator('.file-viewer-window').first()).toBeVisible({ timeout: 5000 })

    // Inject three ghosts with different reasons
    await injectGhostSuggestions(
      mainWindow,
      [
        {
          id: 'ghost-import',
          filePath: targetFile,
          displayName: 'helper.ts',
          relevanceScore: 0.9,
          reason: 'import',
          position: { x: 800, y: 200 },
        },
        {
          id: 'ghost-dependent',
          filePath: '/tmp/fake-dependent.ts',
          displayName: 'consumer.ts',
          relevanceScore: 0.7,
          reason: 'dependent',
          position: { x: 800, y: 350 },
        },
        {
          id: 'ghost-keyword',
          filePath: '/tmp/fake-keyword.ts',
          displayName: 'related.ts',
          relevanceScore: 0.5,
          reason: 'keyword',
          position: { x: 800, y: 500 },
        },
      ],
      sourceFile
    )

    const ghosts = mainWindow.locator('.ghost-suggestion')
    await expect(ghosts).toHaveCount(3, { timeout: 5000 })

    // Verify each reason label
    const reasons = mainWindow.locator('.ghost-suggestion-reason')
    const texts = await reasons.allTextContents()
    expect(texts).toContain('imports')
    expect(texts).toContain('imported by')
    expect(texts).toContain('related')
  })

  test('clicking ghost materializes it into a file viewer', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openFileViewer(mainWindow, sourceFile)
    await expect(mainWindow.locator('.file-viewer-window').first()).toBeVisible({ timeout: 5000 })

    // Inject a ghost pointing to the real target file
    await injectGhostSuggestions(
      mainWindow,
      [
        {
          id: 'ghost-helper-ts',
          filePath: targetFile,
          displayName: 'helper.ts',
          relevanceScore: 0.9,
          reason: 'import',
          position: { x: 800, y: 300 },
        },
      ],
      sourceFile
    )

    const ghost = mainWindow.locator('.ghost-suggestion')
    await expect(ghost.first()).toBeVisible({ timeout: 5000 })

    // Click the ghost to materialize it
    await ghost.first().click()

    // Ghost should disappear (removed from suggestion store)
    await expect(ghost).toHaveCount(0, { timeout: 5000 })

    // A new file viewer window should appear with the target file content
    const fileViewers = mainWindow.locator('.file-viewer-window')
    await expect(fileViewers).toHaveCount(2, { timeout: 5000 })

    // The new file viewer should contain the target file's content
    const newViewer = fileViewers.nth(1)
    const content = newViewer.locator('.file-viewer-content')
    await expect(content).toBeVisible({ timeout: 10000 })
    await expect(content).toContainText('helper')
  })

  test('dismiss ghost suggestion via dismiss button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openFileViewer(mainWindow, sourceFile)
    await expect(mainWindow.locator('.file-viewer-window').first()).toBeVisible({ timeout: 5000 })

    // Inject two ghost suggestions
    await injectGhostSuggestions(
      mainWindow,
      [
        {
          id: 'ghost-a',
          filePath: targetFile,
          displayName: 'helper.ts',
          relevanceScore: 0.9,
          reason: 'import',
          position: { x: 800, y: 250 },
        },
        {
          id: 'ghost-b',
          filePath: '/tmp/fake-other.ts',
          displayName: 'other.ts',
          relevanceScore: 0.6,
          reason: 'keyword',
          position: { x: 800, y: 400 },
        },
      ],
      sourceFile
    )

    const ghosts = mainWindow.locator('.ghost-suggestion')
    await expect(ghosts).toHaveCount(2, { timeout: 5000 })

    // Hover over the first ghost to reveal the dismiss button
    await ghosts.first().hover()

    // Click the dismiss button (force click since it may be opacity-hidden)
    const dismissBtn = ghosts.first().locator('.ghost-suggestion-dismiss')
    await dismissBtn.click({ force: true })

    // Only one ghost should remain
    await expect(ghosts).toHaveCount(1, { timeout: 5000 })

    // No new file viewer should have been created (dismiss, not materialize)
    const fileViewers = mainWindow.locator('.file-viewer-window')
    await expect(fileViewers).toHaveCount(1)
  })

  test('ghost suggestion store state is correctly updated', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openFileViewer(mainWindow, sourceFile)
    await expect(mainWindow.locator('.file-viewer-window').first()).toBeVisible({ timeout: 5000 })

    // Verify store initially has no suggestions
    const initialCount = await mainWindow.evaluate(() => {
      return (window as any).__SMOKE_STORES__?.suggestionStore.getState().suggestions.length
    })
    expect(initialCount).toBe(0)

    // Inject suggestions
    await injectGhostSuggestions(
      mainWindow,
      [
        {
          id: 'ghost-store-test',
          filePath: targetFile,
          displayName: 'helper.ts',
          relevanceScore: 0.85,
          reason: 'import',
          position: { x: 800, y: 300 },
        },
      ],
      sourceFile
    )

    // Verify store has the suggestion
    const storeState = await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__?.suggestionStore
      const state = store.getState()
      return {
        count: state.suggestions.length,
        sourceFilePath: state.sourceFilePath,
        firstId: state.suggestions[0]?.id,
        enabled: state.enabled,
      }
    })
    expect(storeState.count).toBe(1)
    expect(storeState.sourceFilePath).toBe(sourceFile)
    expect(storeState.firstId).toBe('ghost-store-test')
    expect(storeState.enabled).toBe(true)

    // Dismiss and verify store is updated
    const ghost = mainWindow.locator('.ghost-suggestion')
    await ghost.first().hover()
    await ghost.first().locator('.ghost-suggestion-dismiss').click({ force: true })

    const afterDismiss = await mainWindow.evaluate(() => {
      return (window as any).__SMOKE_STORES__?.suggestionStore.getState().suggestions.length
    })
    expect(afterDismiss).toBe(0)
  })
})
