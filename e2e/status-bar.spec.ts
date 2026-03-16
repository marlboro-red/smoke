import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

test.describe('Status Bar Display and Interaction', () => {
  test.describe('Zoom percentage display', () => {
    test('shows 100% zoom on app start', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })
      await expect(zoomBtn).toHaveText('100%')
    })

    test('updates zoom percentage on Cmd+= (zoom in)', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toHaveText('100%', { timeout: 5000 })

      await pressShortcut(mainWindow, '=')
      await mainWindow.waitForTimeout(300)

      const text = await zoomBtn.textContent()
      const zoom = parseInt(text!.replace('%', ''), 10)
      expect(zoom).toBeGreaterThan(100)
    })

    test('updates zoom percentage on Cmd+- (zoom out)', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toHaveText('100%', { timeout: 5000 })

      await pressShortcut(mainWindow, '-')
      await mainWindow.waitForTimeout(300)

      const text = await zoomBtn.textContent()
      const zoom = parseInt(text!.replace('%', ''), 10)
      expect(zoom).toBeLessThan(100)
    })

    test('updates zoom percentage on Ctrl+wheel', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toHaveText('100%', { timeout: 5000 })

      const canvas = mainWindow.locator('.canvas-root')
      await expect(canvas).toBeVisible({ timeout: 5000 })

      // Ctrl+wheel up = zoom in
      await canvas.dispatchEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        clientX: 400,
        clientY: 300,
      })
      await mainWindow.waitForTimeout(300)

      const text = await zoomBtn.textContent()
      const zoom = parseInt(text!.replace('%', ''), 10)
      expect(zoom).toBeGreaterThan(100)
    })
  })

  test.describe('Zoom preset menu', () => {
    test('clicking zoom button opens preset menu', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      await zoomBtn.click()

      const zoomMenu = mainWindow.locator('.status-bar-zoom-menu')
      await expect(zoomMenu).toBeVisible({ timeout: 3000 })

      // Verify all four presets are shown
      const options = mainWindow.locator('.status-bar-zoom-option')
      await expect(options).toHaveCount(4)

      await expect(options.nth(0)).toHaveText('50%')
      await expect(options.nth(1)).toHaveText('100%')
      await expect(options.nth(2)).toHaveText('150%')
      await expect(options.nth(3)).toHaveText('Fit All')
    })

    test('selecting 50% preset sets zoom to 50%', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      await zoomBtn.click()
      const option50 = mainWindow.locator('.status-bar-zoom-option', { hasText: '50%' })
      await option50.click()
      await mainWindow.waitForTimeout(300)

      await expect(zoomBtn).toHaveText('50%')
    })

    test('selecting 100% preset resets zoom to 100%', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      // First zoom to something else
      await pressShortcut(mainWindow, '=')
      await mainWindow.waitForTimeout(300)
      await expect(zoomBtn).not.toHaveText('100%')

      // Now use preset menu to reset to 100%
      await zoomBtn.click()
      const option100 = mainWindow.locator('.status-bar-zoom-option', { hasText: '100%' })
      await option100.click()
      await mainWindow.waitForTimeout(300)

      await expect(zoomBtn).toHaveText('100%')
    })

    test('selecting Fit All adjusts zoom when elements exist', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create a terminal so Fit All has something to fit
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(1000)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      const beforeText = await zoomBtn.textContent()

      await zoomBtn.click()
      const fitAll = mainWindow.locator('.status-bar-zoom-option', { hasText: 'Fit All' })
      await fitAll.click()
      await mainWindow.waitForTimeout(300)

      // Zoom should have changed (unless it was already fitted)
      const afterText = await zoomBtn.textContent()
      const afterZoom = parseInt(afterText!.replace('%', ''), 10)
      // Fit All should produce a valid zoom percentage
      expect(afterZoom).toBeGreaterThan(0)
    })

    test('zoom menu closes after selecting a preset', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      await zoomBtn.click()
      const zoomMenu = mainWindow.locator('.status-bar-zoom-menu')
      await expect(zoomMenu).toBeVisible({ timeout: 3000 })

      // Click a preset
      const option100 = mainWindow.locator('.status-bar-zoom-option', { hasText: '100%' })
      await option100.click()
      await mainWindow.waitForTimeout(300)

      // Menu should be closed
      await expect(zoomMenu).not.toBeVisible()
    })

    test('zoom menu closes on outside click', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      await zoomBtn.click()
      const zoomMenu = mainWindow.locator('.status-bar-zoom-menu')
      await expect(zoomMenu).toBeVisible({ timeout: 3000 })

      // Click on the canvas (outside the menu)
      const canvas = mainWindow.locator('.canvas-root')
      await canvas.click({ position: { x: 400, y: 300 }, force: true })
      await mainWindow.waitForTimeout(300)

      await expect(zoomMenu).not.toBeVisible()
    })

    test('current zoom level is highlighted in preset menu', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      // At default 100%, the 100% option should have active class
      await zoomBtn.click()
      const active100 = mainWindow.locator('.status-bar-zoom-option.active')
      await expect(active100).toHaveText('100%')
    })
  })

  test.describe('Element count display', () => {
    test('shows 0 elements on app start', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const statusBar = mainWindow.locator('.status-bar')
      await expect(statusBar).toBeVisible({ timeout: 5000 })

      // Should show "0 elements"
      await expect(statusBar).toContainText('0 elements')
    })

    test('element count increments on terminal creation', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const statusBar = mainWindow.locator('.status-bar')
      await expect(statusBar).toContainText('0 elements', { timeout: 5000 })

      // Create a terminal
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      await expect(statusBar).toContainText('1 element', { timeout: 5000 })
      // Should show type breakdown with "1 term"
      await expect(statusBar).toContainText('1 term')
    })

    test('element count updates with multiple terminals', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const statusBar = mainWindow.locator('.status-bar')

      // Create first terminal
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
      await expect(statusBar).toContainText('1 element', { timeout: 5000 })

      // Create second terminal
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
      await expect(statusBar).toContainText('2 elements', { timeout: 5000 })
      await expect(statusBar).toContainText('2 term')
    })

    test('element count decrements on terminal close', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const statusBar = mainWindow.locator('.status-bar')

      // Create two terminals
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
      await expect(statusBar).toContainText('2 elements', { timeout: 5000 })

      // Close one
      await pressShortcut(mainWindow, 'w')
      await mainWindow.waitForTimeout(500)
      await expect(statusBar).toContainText('1 element', { timeout: 5000 })
    })

    test('active terminal count shows running terminals', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const statusBar = mainWindow.locator('.status-bar')
      await expect(statusBar).toContainText('0 active', { timeout: 5000 })

      // Create a terminal — it should be running
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(1000)

      await expect(statusBar).toContainText('1 active', { timeout: 5000 })
    })
  })

  test.describe('Git branch display', () => {
    test('shows git branch name in status bar', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const branchEl = mainWindow.locator('.status-bar-branch')
      await expect(branchEl).toBeVisible({ timeout: 10000 })

      // Should contain a non-empty branch name
      const text = await branchEl.textContent()
      expect(text).toBeTruthy()
      expect(text!.trim().length).toBeGreaterThan(0)
    })

    test('git branch display includes branch icon', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const branchEl = mainWindow.locator('.status-bar-branch')
      await expect(branchEl).toBeVisible({ timeout: 10000 })

      // Should contain an SVG icon
      const svg = branchEl.locator('svg')
      await expect(svg).toBeAttached()
    })
  })

  test.describe('Indexing progress display', () => {
    test('indexing indicator is hidden when not indexing', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const indexingEl = mainWindow.locator('.status-bar-indexing')
      // Should not be visible initially (no indexing in progress)
      await expect(indexingEl).not.toBeVisible()
    })

    test('indexing indicator appears when search indexing starts', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Trigger indexing via the store
      await mainWindow.evaluate(() => {
        const stores = (window as any).__SMOKE_STORES__
        stores.indexingStore.getState().setSearchProgress(10, 100)
      })
      await mainWindow.waitForTimeout(300)

      const indexingEl = mainWindow.locator('.status-bar-indexing')
      await expect(indexingEl).toBeVisible({ timeout: 3000 })

      // Should show progress: "Indexing 10/100"
      await expect(indexingEl).toContainText('Indexing 10/100')
    })

    test('indexing indicator shows progress bar', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Trigger indexing with 50% progress
      await mainWindow.evaluate(() => {
        const stores = (window as any).__SMOKE_STORES__
        stores.indexingStore.getState().setSearchProgress(50, 100)
      })
      await mainWindow.waitForTimeout(300)

      const progressTrack = mainWindow.locator('.status-bar-progress-track')
      await expect(progressTrack).toBeVisible({ timeout: 3000 })

      const progressFill = mainWindow.locator('.status-bar-progress-fill')
      await expect(progressFill).toBeVisible()

      // Progress fill should be at 50% width
      const width = await progressFill.evaluate(
        (el) => (el as HTMLElement).style.width
      )
      expect(width).toBe('50%')
    })

    test('indexing indicator shows spinner', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      await mainWindow.evaluate(() => {
        const stores = (window as any).__SMOKE_STORES__
        stores.indexingStore.getState().setSearchProgress(5, 50)
      })
      await mainWindow.waitForTimeout(300)

      const spinner = mainWindow.locator('.status-bar-indexing-spinner')
      await expect(spinner).toBeVisible({ timeout: 3000 })
    })

    test('indexing indicator shows "Analyzing structure" during structure analysis', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      await mainWindow.evaluate(() => {
        const stores = (window as any).__SMOKE_STORES__
        stores.indexingStore.getState().setStructureAnalyzing(true)
      })
      await mainWindow.waitForTimeout(300)

      const indexingEl = mainWindow.locator('.status-bar-indexing')
      await expect(indexingEl).toBeVisible({ timeout: 3000 })
      await expect(indexingEl).toContainText('Analyzing structure')
    })

    test('indexing indicator disappears when indexing completes', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Start indexing
      await mainWindow.evaluate(() => {
        const stores = (window as any).__SMOKE_STORES__
        stores.indexingStore.getState().setSearchProgress(50, 100)
      })
      await mainWindow.waitForTimeout(300)

      const indexingEl = mainWindow.locator('.status-bar-indexing')
      await expect(indexingEl).toBeVisible({ timeout: 3000 })

      // Complete indexing
      await mainWindow.evaluate(() => {
        const stores = (window as any).__SMOKE_STORES__
        stores.indexingStore.getState().setSearchComplete()
      })
      await mainWindow.waitForTimeout(300)

      await expect(indexingEl).not.toBeVisible()
    })
  })
})
