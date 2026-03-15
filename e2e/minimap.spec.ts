import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * Parse the CSS transform string from .canvas-viewport to extract pan (x, y) and zoom (scale).
 * Format: translate3d(Xpx, Ypx, 0) scale(Z)
 */
function parseTransform(transform: string): { x: number; y: number; scale: number } {
  const t3d = transform.match(/translate3d\(\s*([-\d.]+)px,\s*([-\d.]+)px/)
  const sc = transform.match(/scale\(\s*([-\d.]+)\s*\)/)
  return {
    x: t3d ? parseFloat(t3d[1]) : 0,
    y: t3d ? parseFloat(t3d[2]) : 0,
    scale: sc ? parseFloat(sc[1]) : 1,
  }
}

test.describe('Canvas Minimap Interactions', () => {
  test('minimap is hidden when no sessions exist', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const terminalWindow = mainWindow.locator('.terminal-window')

    // Close all existing sessions (app may auto-launch with a default session)
    let count = await terminalWindow.count()
    while (count > 0) {
      // Click the terminal to ensure it's focused before closing
      await terminalWindow.first().click({ force: true })
      await mainWindow.waitForTimeout(200)
      await pressShortcut(mainWindow, 'w')
      await mainWindow.waitForTimeout(500)
      count = await terminalWindow.count()
    }

    const minimap = mainWindow.locator('.minimap-container')
    await expect(minimap).toHaveCount(0, { timeout: 5000 })
  })

  test('minimap appears when a session is created', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const minimap = mainWindow.locator('.minimap-container')
    await expect(minimap).toBeVisible({ timeout: 5000 })

    const canvas = mainWindow.locator('.minimap-canvas')
    await expect(canvas).toBeVisible()
  })

  test('minimap shows element positions as colored rectangles', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a terminal session
    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    // Wait for minimap to render
    const minimapCanvas = mainWindow.locator('.minimap-canvas')
    await expect(minimapCanvas).toBeVisible({ timeout: 5000 })

    // Allow a frame for the canvas to draw
    await mainWindow.waitForTimeout(500)

    // Read pixel data from the minimap canvas to verify colored rectangles are drawn
    // Terminal color is rgba(124, 140, 245, 0.8) — blue/purple accent
    const hasColoredPixels = await mainWindow.evaluate(() => {
      const canvas = document.querySelector('.minimap-canvas') as HTMLCanvasElement
      if (!canvas) return false
      const ctx = canvas.getContext('2d')
      if (!ctx) return false

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const pixels = imageData.data

      // Look for blue/purple-ish pixels (terminal color: R~124, G~140, B~245)
      let bluePixelCount = 0
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]
        const g = pixels[i + 1]
        const b = pixels[i + 2]
        const a = pixels[i + 3]
        // Look for the terminal accent color range
        if (b > 200 && r > 80 && r < 180 && g > 100 && g < 200 && a > 100) {
          bluePixelCount++
        }
      }

      // Should have at least some colored pixels representing the terminal rectangle
      return bluePixelCount > 5
    })

    expect(hasColoredPixels).toBe(true)
  })

  test('clicking minimap pans viewport WITHOUT creating a terminal (regression: smoke-en7)', async ({
    mainWindow,
  }) => {
    await waitForAppReady(mainWindow)

    // Create a terminal so the minimap appears
    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const minimap = mainWindow.locator('.minimap-container')
    await expect(minimap).toBeVisible({ timeout: 5000 })
    await mainWindow.waitForTimeout(500)

    // Record terminal count and viewport transform before click
    const countBefore = await terminalWindow.count()
    const transformBefore = await mainWindow.locator('.canvas-viewport').getAttribute('style')

    // Click on the minimap canvas — this should pan the viewport, not create a terminal
    const minimapCanvas = mainWindow.locator('.minimap-canvas')
    const box = await minimapCanvas.boundingBox()
    expect(box).toBeTruthy()

    // Click near the top-left of the minimap (away from center) to trigger a pan
    await minimapCanvas.click({ position: { x: 10, y: 10 } })

    // Wait for the pan + store sync (100ms debounce + buffer)
    await mainWindow.waitForTimeout(500)

    // CRITICAL: No new terminal should have been created
    const countAfter = await terminalWindow.count()
    expect(countAfter).toBe(countBefore)

    // Verify the viewport actually panned (transform changed)
    const transformAfter = await mainWindow.locator('.canvas-viewport').getAttribute('style')
    expect(transformAfter).not.toBe(transformBefore)
  })

  test('clicking minimap does not create terminal on double-click either', async ({
    mainWindow,
  }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const minimap = mainWindow.locator('.minimap-container')
    await expect(minimap).toBeVisible({ timeout: 5000 })
    await mainWindow.waitForTimeout(500)

    const countBefore = await terminalWindow.count()

    // Double-click on minimap — should NOT create a terminal
    const minimapCanvas = mainWindow.locator('.minimap-canvas')
    await minimapCanvas.dblclick({ position: { x: 90, y: 60 } })

    await mainWindow.waitForTimeout(1000)

    const countAfter = await terminalWindow.count()
    expect(countAfter).toBe(countBefore)
  })

  test('viewport rectangle updates as canvas pans', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const minimapCanvas = mainWindow.locator('.minimap-canvas')
    await expect(minimapCanvas).toBeVisible({ timeout: 5000 })
    await mainWindow.waitForTimeout(500)

    // Capture minimap canvas pixel data before panning
    const snapshotBefore = await mainWindow.evaluate(() => {
      const canvas = document.querySelector('.minimap-canvas') as HTMLCanvasElement
      if (!canvas) return null
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      // Sample a grid of pixels to detect changes in viewport rectangle position
      const samples: number[] = []
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      // Sample every 10th pixel's RGBA
      for (let i = 0; i < data.length; i += 40) {
        samples.push(data[i], data[i + 1], data[i + 2], data[i + 3])
      }
      return samples
    })

    // Pan the canvas by scrolling
    const canvasRoot = mainWindow.locator('.canvas-root')
    await canvasRoot.evaluate((el) => {
      el.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: 300,
          deltaY: 200,
          bubbles: true,
          cancelable: true,
        })
      )
    })

    // Wait for pan + minimap redraw
    await mainWindow.waitForTimeout(500)

    // Capture minimap canvas pixel data after panning
    const snapshotAfter = await mainWindow.evaluate(() => {
      const canvas = document.querySelector('.minimap-canvas') as HTMLCanvasElement
      if (!canvas) return null
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      const samples: number[] = []
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 0; i < data.length; i += 40) {
        samples.push(data[i], data[i + 1], data[i + 2], data[i + 3])
      }
      return samples
    })

    expect(snapshotBefore).not.toBeNull()
    expect(snapshotAfter).not.toBeNull()

    // The pixel data should differ because the viewport rectangle moved
    let diffCount = 0
    for (let i = 0; i < snapshotBefore!.length; i++) {
      if (snapshotBefore![i] !== snapshotAfter![i]) {
        diffCount++
      }
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('minimap visible and functional with many elements', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create multiple terminal sessions
    for (let i = 0; i < 5; i++) {
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
    }

    const terminalWindows = mainWindow.locator('.terminal-window')
    const count = await terminalWindows.count()
    expect(count).toBeGreaterThanOrEqual(5)

    // Minimap should still be visible
    const minimap = mainWindow.locator('.minimap-container')
    await expect(minimap).toBeVisible({ timeout: 5000 })

    const minimapCanvas = mainWindow.locator('.minimap-canvas')
    await expect(minimapCanvas).toBeVisible()

    // Wait for canvas draw
    await mainWindow.waitForTimeout(500)

    // Verify multiple colored rectangles are drawn on the minimap
    const elementRectCount = await mainWindow.evaluate(() => {
      const canvas = document.querySelector('.minimap-canvas') as HTMLCanvasElement
      if (!canvas) return 0
      const ctx = canvas.getContext('2d')
      if (!ctx) return 0

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const pixels = imageData.data

      // Count distinct colored pixel clusters (blue/purple terminal color)
      let coloredPixels = 0
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]
        const g = pixels[i + 1]
        const b = pixels[i + 2]
        const a = pixels[i + 3]
        if (b > 200 && r > 80 && r < 180 && g > 100 && g < 200 && a > 100) {
          coloredPixels++
        }
      }
      return coloredPixels
    })

    // With 5 terminals there should be significantly more colored pixels
    // than with just 1 terminal
    expect(elementRectCount).toBeGreaterThan(10)
  })

  test('minimap disappears when all sessions are closed', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Ensure at least one session exists
    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const minimap = mainWindow.locator('.minimap-container')
    await expect(minimap).toBeVisible({ timeout: 5000 })

    // Close ALL sessions (app may have auto-launched with a default session)
    let count = await terminalWindow.count()
    while (count > 0) {
      await terminalWindow.first().click({ force: true })
      await mainWindow.waitForTimeout(200)
      await pressShortcut(mainWindow, 'w')
      await mainWindow.waitForTimeout(500)
      count = await terminalWindow.count()
    }

    // Minimap should disappear (component returns null when sessions.length === 0)
    await expect(minimap).toHaveCount(0, { timeout: 5000 })
  })

  test('minimap click pans to correct general area', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a terminal
    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })
    await mainWindow.waitForTimeout(500)

    // Get the initial viewport transform
    const viewport = mainWindow.locator('.canvas-viewport')
    const styleBefore = await viewport.getAttribute('style') ?? ''
    const before = parseTransform(styleBefore)

    // Click on the top-left corner of the minimap
    const minimapCanvas = mainWindow.locator('.minimap-canvas')
    await minimapCanvas.click({ position: { x: 5, y: 5 } })
    await mainWindow.waitForTimeout(500)

    const styleAfterTopLeft = await viewport.getAttribute('style') ?? ''
    const afterTopLeft = parseTransform(styleAfterTopLeft)

    // Click on the bottom-right corner of the minimap
    await minimapCanvas.click({ position: { x: 175, y: 115 } })
    await mainWindow.waitForTimeout(500)

    const styleAfterBottomRight = await viewport.getAttribute('style') ?? ''
    const afterBottomRight = parseTransform(styleAfterBottomRight)

    // Clicking top-left vs bottom-right should result in different pan positions
    // (unless the viewport is exactly centered, which is unlikely with an element)
    const topLeftMoved = afterTopLeft.x !== before.x || afterTopLeft.y !== before.y
    const positionsDiffer =
      afterTopLeft.x !== afterBottomRight.x || afterTopLeft.y !== afterBottomRight.y

    expect(topLeftMoved || positionsDiffer).toBe(true)
  })
})
