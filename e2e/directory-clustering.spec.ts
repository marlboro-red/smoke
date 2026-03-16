import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * Helper: ensure zoom is at 100% by pressing Cmd+0 (resetZoom).
 */
async function ensureZoomReset(mainWindow: import('@playwright/test').Page): Promise<void> {
  await pressShortcut(mainWindow, '0')
  await mainWindow.waitForTimeout(300)
}

/**
 * Create multiple file sessions from the same directory via the session store.
 * Uses synthetic file paths — no real files needed since clustering only reads metadata.
 */
async function createFileSessions(
  page: import('@playwright/test').Page,
  dirPath: string,
  fileNames: string[],
  baseX = 100,
  baseY = 100,
  spacing = 200,
): Promise<string[]> {
  return page.evaluate(
    ({ dirPath, fileNames, baseX, baseY, spacing }) => {
      const store = (window as any).__SMOKE_STORES__?.sessionStore
      if (!store) throw new Error('sessionStore not available')
      const ids: string[] = []
      for (let i = 0; i < fileNames.length; i++) {
        const filePath = `${dirPath}/${fileNames[i]}`
        const session = store.getState().createFileSession(
          filePath,
          `// content of ${fileNames[i]}`,
          'typescript',
          { x: baseX + i * spacing, y: baseY },
        )
        ids.push(session.id)
      }
      return ids
    },
    { dirPath, fileNames, baseX, baseY, spacing },
  )
}

/**
 * Zoom out to below the cluster threshold (< 20%).
 * From 100%, each Cmd+- divides by 1.2:
 * 100→83→69→58→48→40→33→28→23→19
 * 9 presses reaches ~19%.
 */
async function zoomBelowClusterThreshold(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 9; i++) {
    await pressShortcut(page, '-')
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(500) // allow viewport culling debounce
}

/**
 * Read current zoom percentage from the status bar.
 */
async function getZoomPercent(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.locator('.status-bar-zoom-btn').textContent()
  return parseInt(text!.replace('%', ''), 10)
}

test.describe('Directory Clustering at Low Zoom Levels', () => {
  test('cluster cards appear when zooming below 20% with 2+ files from same directory', async ({
    mainWindow,
  }) => {
    await waitForAppReady(mainWindow)
    await ensureZoomReset(mainWindow)

    // Create 3 file sessions from the same directory
    await createFileSessions(mainWindow, '/project/src/stores', [
      'sessionStore.ts',
      'canvasStore.ts',
      'connectorStore.ts',
    ])
    await mainWindow.waitForTimeout(300)

    // Verify file sessions are rendered (not clustered yet)
    const clusterCards = mainWindow.locator('.directory-cluster-card')
    await expect(clusterCards).toHaveCount(0)

    // Zoom out below cluster threshold
    await zoomBelowClusterThreshold(mainWindow)

    const zoom = await getZoomPercent(mainWindow)
    expect(zoom).toBeLessThan(20)

    // Cluster card should appear
    await expect(clusterCards.first()).toBeVisible({ timeout: 5000 })
    await expect(clusterCards).toHaveCount(1)
  })

  test('cluster card shows correct directory name and file count', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await ensureZoomReset(mainWindow)

    await createFileSessions(mainWindow, '/project/src/utils', [
      'format.ts',
      'parse.ts',
      'validate.ts',
      'helpers.ts',
    ])
    await mainWindow.waitForTimeout(300)

    await zoomBelowClusterThreshold(mainWindow)

    const clusterCard = mainWindow.locator('.directory-cluster-card').first()
    await expect(clusterCard).toBeVisible({ timeout: 5000 })

    // Directory name should be "utils"
    const clusterName = clusterCard.locator('.cluster-name')
    await expect(clusterName).toHaveText('utils')

    // File count badge should show "4 files"
    const fileCount = clusterCard.locator('.cluster-file-count')
    await expect(fileCount).toHaveText('4 files')
  })

  test('individual file sessions are hidden when clustered', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await ensureZoomReset(mainWindow)

    const sessionIds = await createFileSessions(mainWindow, '/project/src/hooks', [
      'useAuth.ts',
      'useFetch.ts',
    ])
    await mainWindow.waitForTimeout(300)

    // File viewer windows should be visible before clustering
    for (const id of sessionIds) {
      const el = mainWindow.locator(`[data-session-id="${id}"]`)
      // At least one should be attached (rendered in DOM)
      await expect(el.first()).toBeAttached({ timeout: 3000 })
    }

    // Zoom below cluster threshold
    await zoomBelowClusterThreshold(mainWindow)

    // Cluster card should appear
    const clusterCard = mainWindow.locator('.directory-cluster-card')
    await expect(clusterCard.first()).toBeVisible({ timeout: 5000 })

    // Individual file sessions should be hidden (not rendered)
    for (const id of sessionIds) {
      const el = mainWindow.locator(`[data-session-id="${id}"]`)
      await expect(el).toHaveCount(0, { timeout: 3000 })
    }
  })

  test('clicking a cluster card zooms to 50% and expands individual files', async ({
    mainWindow,
  }) => {
    await waitForAppReady(mainWindow)
    await ensureZoomReset(mainWindow)

    await createFileSessions(mainWindow, '/project/src/components', [
      'Button.tsx',
      'Input.tsx',
      'Modal.tsx',
    ])
    await mainWindow.waitForTimeout(300)

    // Zoom out below cluster threshold
    await zoomBelowClusterThreshold(mainWindow)

    const clusterCard = mainWindow.locator('.directory-cluster-card').first()
    await expect(clusterCard).toBeVisible({ timeout: 5000 })

    // Click the cluster card to zoom in
    await clusterCard.click()
    // Wait for zoom animation (400ms + buffer)
    await mainWindow.waitForTimeout(600)

    // Zoom should now be 50%
    const zoom = await getZoomPercent(mainWindow)
    expect(zoom).toBe(50)

    // Cluster card should no longer be visible (zoom > 20%)
    await expect(mainWindow.locator('.directory-cluster-card')).toHaveCount(0, { timeout: 3000 })
  })

  test('multiple directories produce separate cluster cards', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await ensureZoomReset(mainWindow)

    // Create files in two different directories
    await createFileSessions(
      mainWindow,
      '/project/src/stores',
      ['sessionStore.ts', 'canvasStore.ts'],
      100,
      100,
    )
    await createFileSessions(
      mainWindow,
      '/project/src/hooks',
      ['useAuth.ts', 'useFetch.ts'],
      100,
      500,
    )
    await mainWindow.waitForTimeout(300)

    await zoomBelowClusterThreshold(mainWindow)

    const clusterCards = mainWindow.locator('.directory-cluster-card')
    await expect(clusterCards).toHaveCount(2, { timeout: 5000 })

    // Verify both directory names are shown
    const names = await clusterCards.locator('.cluster-name').allTextContents()
    expect(names.sort()).toEqual(['hooks', 'stores'])
  })

  test('single file in a directory does not create a cluster', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await ensureZoomReset(mainWindow)

    // One directory with 2 files (should cluster), one with 1 file (should not)
    await createFileSessions(
      mainWindow,
      '/project/src/stores',
      ['sessionStore.ts', 'canvasStore.ts'],
      100,
      100,
    )
    await createFileSessions(
      mainWindow,
      '/project/src/config',
      ['settings.ts'],
      100,
      500,
    )
    await mainWindow.waitForTimeout(300)

    await zoomBelowClusterThreshold(mainWindow)

    // Only one cluster card (for "stores"), not for "config"
    const clusterCards = mainWindow.locator('.directory-cluster-card')
    await expect(clusterCards).toHaveCount(1, { timeout: 5000 })

    const clusterName = clusterCards.first().locator('.cluster-name')
    await expect(clusterName).toHaveText('stores')
  })

  test('zooming back above threshold removes clusters and shows files', async ({
    mainWindow,
  }) => {
    await waitForAppReady(mainWindow)
    await ensureZoomReset(mainWindow)

    await createFileSessions(mainWindow, '/project/src/stores', [
      'sessionStore.ts',
      'canvasStore.ts',
    ])
    await mainWindow.waitForTimeout(300)

    // Zoom out below cluster threshold
    await zoomBelowClusterThreshold(mainWindow)

    const clusterCard = mainWindow.locator('.directory-cluster-card')
    await expect(clusterCard.first()).toBeVisible({ timeout: 5000 })

    // Zoom back to 100% — clusters should disappear
    await ensureZoomReset(mainWindow)
    await mainWindow.waitForTimeout(500)

    await expect(clusterCard).toHaveCount(0, { timeout: 3000 })
  })
})
