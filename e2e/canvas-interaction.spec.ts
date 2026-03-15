import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * Helper: ensure zoom is at 100% by pressing Cmd+0 (resetZoom).
 * Handles cases where prior test state may have leaked.
 */
async function ensureZoomReset(mainWindow: import('@playwright/test').Page): Promise<void> {
  await pressShortcut(mainWindow, '0')
  await mainWindow.waitForTimeout(300)
}

test.describe('Canvas Pan, Zoom, and Grid Interaction', () => {
  test.describe('Zoom via keyboard shortcuts', () => {
    test('Cmd+= zooms in', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await ensureZoomReset(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })
      const initialText = await zoomBtn.textContent()
      const initialZoom = parseInt(initialText!.replace('%', ''), 10)

      await pressShortcut(mainWindow, '=')
      await mainWindow.waitForTimeout(300)

      const afterText = await zoomBtn.textContent()
      const afterZoom = parseInt(afterText!.replace('%', ''), 10)
      expect(afterZoom).toBeGreaterThan(initialZoom)
    })

    test('Cmd+- zooms out', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await ensureZoomReset(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })
      const initialText = await zoomBtn.textContent()
      const initialZoom = parseInt(initialText!.replace('%', ''), 10)

      await pressShortcut(mainWindow, '-')
      await mainWindow.waitForTimeout(300)

      const afterText = await zoomBtn.textContent()
      const afterZoom = parseInt(afterText!.replace('%', ''), 10)
      expect(afterZoom).toBeLessThan(initialZoom)
    })

    test('Cmd+0 resets zoom to 100%', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      // Zoom in so we're not at 100%
      await pressShortcut(mainWindow, '=')
      await mainWindow.waitForTimeout(300)

      const zoomedText = await zoomBtn.textContent()
      const zoomedValue = parseInt(zoomedText!.replace('%', ''), 10)
      expect(zoomedValue).not.toBe(100)

      // Reset zoom
      await pressShortcut(mainWindow, '0')
      await mainWindow.waitForTimeout(300)

      const resetText = await zoomBtn.textContent()
      expect(resetText).toBe('100%')
    })

    test('multiple Cmd+= increases zoom progressively', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await ensureZoomReset(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      const zoomValues: number[] = []

      for (let i = 0; i < 3; i++) {
        const text = await zoomBtn.textContent()
        zoomValues.push(parseInt(text!.replace('%', ''), 10))
        await pressShortcut(mainWindow, '=')
        await mainWindow.waitForTimeout(300)
      }
      const finalText = await zoomBtn.textContent()
      zoomValues.push(parseInt(finalText!.replace('%', ''), 10))

      // Each zoom level should be strictly greater than the previous
      for (let i = 1; i < zoomValues.length; i++) {
        expect(zoomValues[i]).toBeGreaterThan(zoomValues[i - 1])
      }
    })
  })

  test.describe('Zoom via mouse wheel', () => {
    test('Ctrl+wheel zooms in/out', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await ensureZoomReset(mainWindow)

      const canvas = mainWindow.locator('.canvas-root')
      await expect(canvas).toBeVisible({ timeout: 5000 })

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      const initialText = await zoomBtn.textContent()
      const initialZoom = parseInt(initialText!.replace('%', ''), 10)

      // Ctrl+wheel up = zoom in (negative deltaY)
      await canvas.dispatchEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        clientX: 400,
        clientY: 300,
      })
      await mainWindow.waitForTimeout(300)

      const afterZoomInText = await zoomBtn.textContent()
      const afterZoomIn = parseInt(afterZoomInText!.replace('%', ''), 10)
      expect(afterZoomIn).toBeGreaterThan(initialZoom)

      // Ctrl+wheel down = zoom out (positive deltaY)
      await canvas.dispatchEvent('wheel', {
        deltaY: 100,
        ctrlKey: true,
        clientX: 400,
        clientY: 300,
      })
      await mainWindow.waitForTimeout(300)

      const afterZoomOutText = await zoomBtn.textContent()
      const afterZoomOut = parseInt(afterZoomOutText!.replace('%', ''), 10)
      expect(afterZoomOut).toBeLessThan(afterZoomIn)
    })
  })

  test.describe('Viewport transform updates', () => {
    test('canvas-viewport transform reflects zoom changes', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // canvas-viewport is position:absolute with no intrinsic size, so use waitForSelector
      await mainWindow.waitForSelector('.canvas-viewport', { state: 'attached', timeout: 5000 })

      const initialTransform = await mainWindow.evaluate(
        () => (document.querySelector('.canvas-viewport') as HTMLElement)?.style.transform ?? ''
      )

      await pressShortcut(mainWindow, '=')
      await mainWindow.waitForTimeout(300)

      const afterTransform = await mainWindow.evaluate(
        () => (document.querySelector('.canvas-viewport') as HTMLElement)?.style.transform ?? ''
      )

      expect(afterTransform).not.toBe(initialTransform)
      const scaleMatch = afterTransform.match(/scale\(([\d.]+)\)/)
      expect(scaleMatch).toBeTruthy()
      expect(parseFloat(scaleMatch![1])).toBeGreaterThan(1)
    })

    test('scroll-to-pan updates viewport transform translate', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const canvas = mainWindow.locator('.canvas-root')
      await expect(canvas).toBeVisible({ timeout: 5000 })

      // Dispatch a plain wheel event (no modifier) to trigger scroll-to-pan
      await canvas.dispatchEvent('wheel', {
        deltaX: 50,
        deltaY: 80,
        ctrlKey: false,
        metaKey: false,
        clientX: 400,
        clientY: 300,
      })
      await mainWindow.waitForTimeout(300)

      const transform = await mainWindow.evaluate(
        () => (document.querySelector('.canvas-viewport') as HTMLElement)?.style.transform ?? ''
      )
      const translateMatch = transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/)
      expect(translateMatch).toBeTruthy()
      // Positive deltaX/deltaY should produce negative pan
      const tx = parseFloat(translateMatch![1])
      const ty = parseFloat(translateMatch![2])
      expect(tx).toBeLessThan(0)
      expect(ty).toBeLessThan(0)
    })

    test('zoom reset restores transform to scale(1)', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      await mainWindow.waitForSelector('.canvas-viewport', { state: 'attached', timeout: 5000 })

      // Zoom in first
      await pressShortcut(mainWindow, '=')
      await pressShortcut(mainWindow, '=')
      await mainWindow.waitForTimeout(300)

      // Reset
      await pressShortcut(mainWindow, '0')
      await mainWindow.waitForTimeout(300)

      const transform = await mainWindow.evaluate(
        () => (document.querySelector('.canvas-viewport') as HTMLElement)?.style.transform ?? ''
      )
      const scaleMatch = transform.match(/scale\(([\d.]+)\)/)
      expect(scaleMatch).toBeTruthy()
      expect(parseFloat(scaleMatch![1])).toBeCloseTo(1, 1)
    })
  })

  test.describe('Grid visibility', () => {
    test('grid dots are visible by default', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await ensureZoomReset(mainWindow)

      // Grid uses an SVG with a pattern inside canvas-viewport
      const gridSvg = mainWindow.locator('.canvas-viewport > svg')
      await expect(gridSvg.first()).toBeVisible({ timeout: 5000 })

      const pattern = mainWindow.locator('#grid-pattern')
      await expect(pattern).toBeAttached()
    })

    test('grid hides at very low zoom levels (< 0.3)', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await ensureZoomReset(mainWindow)

      await mainWindow.waitForSelector('.canvas-viewport', { state: 'attached', timeout: 5000 })

      // Zoom out significantly — each Cmd+- divides by 1.2
      // From 1.0: 0.83, 0.69, 0.58, 0.48, 0.40, 0.33, 0.28 (7 presses)
      for (let i = 0; i < 7; i++) {
        await pressShortcut(mainWindow, '-')
        await mainWindow.waitForTimeout(150)
      }
      await mainWindow.waitForTimeout(300)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      const zoomText = await zoomBtn.textContent()
      const zoomValue = parseInt(zoomText!.replace('%', ''), 10)
      expect(zoomValue).toBeLessThan(30)

      // Grid SVG should no longer be rendered (Grid returns null when zoom < 0.3)
      const gridSvgCount = await mainWindow.evaluate(
        () => document.querySelectorAll('.canvas-viewport > svg').length
      )
      expect(gridSvgCount).toBe(0)
    })
  })

  test.describe('Zoom level in status bar', () => {
    test('status bar shows correct zoom percentage', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await ensureZoomReset(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      await expect(zoomBtn).toHaveText('100%')
    })

    test('status bar zoom updates after Cmd+=', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await ensureZoomReset(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toHaveText('100%', { timeout: 5000 })

      await pressShortcut(mainWindow, '=')
      await mainWindow.waitForTimeout(300)

      // After zoom in (factor 1.2), should show 120%
      await expect(zoomBtn).toHaveText('120%')
    })

    test('status bar zoom updates after Cmd+-', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await ensureZoomReset(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toHaveText('100%', { timeout: 5000 })

      await pressShortcut(mainWindow, '-')
      await mainWindow.waitForTimeout(300)

      // After zoom out (factor 1/1.2 ~ 0.833), should show 83%
      await expect(zoomBtn).toHaveText('83%')
    })

    test('zoom preset menu is clickable', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      // Click to open zoom menu
      await zoomBtn.click()

      const zoomMenu = mainWindow.locator('.status-bar-zoom-menu')
      await expect(zoomMenu).toBeVisible({ timeout: 3000 })

      // Should show preset options
      const options = mainWindow.locator('.status-bar-zoom-option')
      const count = await options.count()
      expect(count).toBeGreaterThanOrEqual(3) // 50%, 100%, 150%, Fit All

      // Click 150% preset
      const preset150 = options.filter({ hasText: '150%' })
      await preset150.click()
      await mainWindow.waitForTimeout(300)

      await expect(zoomBtn).toHaveText('150%')
    })
  })

  test.describe('Pan via scroll', () => {
    test('scroll without modifier pans the canvas', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const canvas = mainWindow.locator('.canvas-root')
      await expect(canvas).toBeVisible({ timeout: 5000 })

      const initialTransform = await mainWindow.evaluate(
        () => (document.querySelector('.canvas-viewport') as HTMLElement)?.style.transform ?? ''
      )

      // Scroll to pan
      await canvas.dispatchEvent('wheel', {
        deltaX: 0,
        deltaY: 200,
        ctrlKey: false,
        metaKey: false,
        clientX: 400,
        clientY: 300,
      })
      await mainWindow.waitForTimeout(300)

      const afterTransform = await mainWindow.evaluate(
        () => (document.querySelector('.canvas-viewport') as HTMLElement)?.style.transform ?? ''
      )
      expect(afterTransform).not.toBe(initialTransform)
    })
  })
})
