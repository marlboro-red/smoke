import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * Helper: close all terminal sessions using the X button (safe, won't close BrowserWindow).
 */
async function closeAllSessions(page: import('@playwright/test').Page): Promise<void> {
  let count = await page.locator('.terminal-window').count()
  while (count > 0) {
    const closeBtn = page.locator('.terminal-window .window-chrome-close').first()
    await closeBtn.click({ force: true })
    await page.waitForTimeout(300)
    count = await page.locator('.terminal-window').count()
  }
}

/**
 * Helper: read position, size, and zIndex from the DOM style of a terminal window.
 */
async function getWindowStyle(
  page: import('@playwright/test').Page,
  sessionId: string
): Promise<{ left: number; top: number; width: number; height: number; zIndex: number }> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"]`) as HTMLElement
    const style = el.style
    return {
      left: parseFloat(style.left) || 0,
      top: parseFloat(style.top) || 0,
      width: parseFloat(style.width) || 0,
      height: parseFloat(style.height) || 0,
      zIndex: parseInt(style.zIndex, 10) || 0,
    }
  }, sessionId)
}

/**
 * Helper: initiate a resize by temporarily disabling pointer-events on the
 * terminal body so that mouse.down at the handle coordinates actually hits
 * the resize handle (not the overlapping xterm canvas).
 */
async function startResize(
  page: import('@playwright/test').Page,
  sessionId: string,
  direction: 'e' | 's' | 'se'
): Promise<{ startX: number; startY: number }> {
  // Get handle center position
  const pos = await page.evaluate(([id, dir]) => {
    const windowEl = document.querySelector(`[data-session-id="${id}"]`)!
    const handle = windowEl.querySelector(`.resize-handle-${dir}`)!
    const rect = handle.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }, [sessionId, direction] as const)

  // Disable pointer-events on the terminal body so the resize handle is clickable
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"] .terminal-body`) as HTMLElement
    if (el) el.style.pointerEvents = 'none'
  }, sessionId)

  // Move to handle and press down — should now hit the resize handle
  await page.mouse.move(pos.x, pos.y)
  await page.mouse.down()

  // Restore pointer-events
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"] .terminal-body`) as HTMLElement
    if (el) el.style.pointerEvents = ''
  }, sessionId)

  return { startX: pos.x, startY: pos.y }
}

/**
 * Helper: bring a terminal window to front by dispatching pointerdown directly
 * on its terminal-window div. This triggers handlePointerDown (bringToFront + focusSession)
 * without initiating drag (since the event targets the outer div, not the chrome).
 */
async function bringToFrontViaClick(
  page: import('@playwright/test').Page,
  sessionId: string
): Promise<void> {
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"]`) as HTMLElement
    el.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      composed: true,
      pointerId: 1,
    }))
  }, sessionId)
}

/**
 * Helper: create a terminal and drag it to a position where its SE corner
 * is visible within the 1200x800 Electron viewport.
 * Default terminal size is 640x480, so we need position.y < ~300.
 */
async function createTerminalInView(
  page: import('@playwright/test').Page
): Promise<string> {
  // Create a terminal at a low canvas position via double-click
  const canvas = page.locator('.canvas-root')
  await canvas.dblclick({ position: { x: 150, y: 80 } })

  const terminalWindow = page.locator('.terminal-window')
  await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

  const sessionId = await terminalWindow.first().getAttribute('data-session-id')
  expect(sessionId).toBeTruthy()
  return sessionId!
}

/** Default grid size used by the app */
const DEFAULT_GRID_SIZE = 20

test.describe('Window Drag, Resize, and Snap', () => {
  test('drag terminal window by title bar updates position', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const sessionId = await terminalWindow.first().getAttribute('data-session-id')
    expect(sessionId).toBeTruthy()

    const before = await getWindowStyle(mainWindow, sessionId!)

    const chrome = terminalWindow.first().locator('.window-chrome')
    const chromeBbox = await chrome.boundingBox()
    expect(chromeBbox).toBeTruthy()

    const startX = chromeBbox!.x + chromeBbox!.width / 2
    const startY = chromeBbox!.y + chromeBbox!.height / 2

    await mainWindow.mouse.move(startX, startY)
    await mainWindow.mouse.down()
    await mainWindow.mouse.move(startX + 150, startY + 100, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId!)

    expect(after.left).toBeGreaterThan(before.left)
    expect(after.top).toBeGreaterThan(before.top)
  })

  test('resize terminal via southeast handle updates size', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    // Create terminal positioned so its SE corner is within the viewport
    const sessionId = await createTerminalInView(mainWindow)

    const before = await getWindowStyle(mainWindow, sessionId)

    const start = await startResize(mainWindow, sessionId, 'se')

    await mainWindow.mouse.move(start.startX + 120, start.startY + 80, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId)

    expect(after.width).toBeGreaterThan(before.width)
    expect(after.height).toBeGreaterThan(before.height)
  })

  test('resize terminal via east handle updates width only', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    // Create terminal positioned so handles are within the viewport
    const sessionId = await createTerminalInView(mainWindow)

    const before = await getWindowStyle(mainWindow, sessionId)

    const start = await startResize(mainWindow, sessionId, 'e')

    await mainWindow.mouse.move(start.startX + 100, start.startY, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId)

    expect(after.width).toBeGreaterThan(before.width)
    expect(after.height).toBe(before.height)
  })

  test('grid snapping — positions snap to grid multiples on drag end', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const sessionId = await terminalWindow.first().getAttribute('data-session-id')
    expect(sessionId).toBeTruthy()

    const chrome = terminalWindow.first().locator('.window-chrome')
    const chromeBbox = await chrome.boundingBox()
    expect(chromeBbox).toBeTruthy()

    const startX = chromeBbox!.x + chromeBbox!.width / 2
    const startY = chromeBbox!.y + chromeBbox!.height / 2

    // Drag by 73px right, 57px down — intentionally not grid multiples
    await mainWindow.mouse.move(startX, startY)
    await mainWindow.mouse.down()
    await mainWindow.mouse.move(startX + 73, startY + 57, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId!)

    expect(after.left % DEFAULT_GRID_SIZE).toBe(0)
    expect(after.top % DEFAULT_GRID_SIZE).toBe(0)
  })

  test('grid snapping — sizes snap to grid multiples on resize end', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    // Create terminal positioned so its SE corner is within the viewport
    const sessionId = await createTerminalInView(mainWindow)

    const before = await getWindowStyle(mainWindow, sessionId)

    const start = await startResize(mainWindow, sessionId, 'se')

    await mainWindow.mouse.move(start.startX + 67, start.startY + 43, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId)

    // Verify resize actually changed size
    expect(after.width).not.toBe(before.width)

    // Size should be snapped to grid multiples
    expect(after.width % DEFAULT_GRID_SIZE).toBe(0)
    expect(after.height % DEFAULT_GRID_SIZE).toBe(0)
  })

  test('snap preview appears during drag', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const snapPreview = mainWindow.locator('.snap-preview')
    await expect(snapPreview).toHaveCount(0)

    const chrome = terminalWindow.first().locator('.window-chrome')
    const chromeBbox = await chrome.boundingBox()
    expect(chromeBbox).toBeTruthy()

    const startX = chromeBbox!.x + chromeBbox!.width / 2
    const startY = chromeBbox!.y + chromeBbox!.height / 2

    await mainWindow.mouse.move(startX, startY)
    await mainWindow.mouse.down()
    await mainWindow.mouse.move(startX + 50, startY + 50, { steps: 5 })

    await expect(snapPreview).toBeVisible({ timeout: 2000 })

    await mainWindow.mouse.up()
    await mainWindow.waitForTimeout(300)
    await expect(snapPreview).toHaveCount(0)
  })

  test('snap preview appears during resize', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    // Create terminal positioned so its SE corner is within the viewport
    const sessionId = await createTerminalInView(mainWindow)

    await mainWindow.waitForTimeout(1000)

    const snapPreview = mainWindow.locator('.snap-preview')
    await expect(snapPreview).toHaveCount(0)

    const start = await startResize(mainWindow, sessionId, 'se')

    // Move to trigger snap preview rendering
    await mainWindow.mouse.move(start.startX + 80, start.startY + 60, { steps: 10 })

    await expect(snapPreview).toBeVisible({ timeout: 3000 })

    // Release the resize
    await mainWindow.mouse.up()

    // Snap preview should disappear after resize completes
    await expect(snapPreview).toHaveCount(0, { timeout: 5000 })
  })

  test('z-index ordering — clicking a window brings it to front', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    // Create two terminals via Cmd+N
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const terminalWindows = mainWindow.locator('.terminal-window')
    const count = await terminalWindows.count()
    expect(count).toBeGreaterThanOrEqual(2)

    const firstId = await terminalWindows.nth(0).getAttribute('data-session-id')
    const secondId = await terminalWindows.nth(1).getAttribute('data-session-id')
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()

    // Second terminal should have higher zIndex (more recently created)
    const firstBefore = await getWindowStyle(mainWindow, firstId!)
    const secondBefore = await getWindowStyle(mainWindow, secondId!)
    expect(secondBefore.zIndex).toBeGreaterThan(firstBefore.zIndex)

    // Click the first terminal by dispatching pointerdown directly on it
    // (bypasses z-index overlap where the second terminal covers the first)
    await bringToFrontViaClick(mainWindow, firstId!)
    await mainWindow.waitForTimeout(500)

    // First terminal should now have a higher zIndex
    const firstAfter = await getWindowStyle(mainWindow, firstId!)
    const secondAfter = await getWindowStyle(mainWindow, secondId!)
    expect(firstAfter.zIndex).toBeGreaterThan(secondAfter.zIndex)
  })

  test('z-index ordering — dragging a window brings it to front', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    // Create two terminals
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const terminalWindows = mainWindow.locator('.terminal-window')
    const count = await terminalWindows.count()
    expect(count).toBeGreaterThanOrEqual(2)

    const firstId = await terminalWindows.nth(0).getAttribute('data-session-id')
    const secondId = await terminalWindows.nth(1).getAttribute('data-session-id')
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()

    const firstBefore = await getWindowStyle(mainWindow, firstId!)
    const secondBefore = await getWindowStyle(mainWindow, secondId!)
    expect(secondBefore.zIndex).toBeGreaterThan(firstBefore.zIndex)

    // Initiate drag on first terminal's chrome by dispatching pointerdown directly
    // (bypasses z-index overlap), then complete the drag via mouse.move/up
    const chromePos = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)!
      const chrome = el.querySelector('.window-chrome')!
      const rect = chrome.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }, firstId!)

    await mainWindow.mouse.move(chromePos.x, chromePos.y)

    // Dispatch pointerdown on the chrome (triggers onDragStart which calls bringToFront)
    await mainWindow.evaluate(([id, x, y]) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)!
      const chrome = el.querySelector('.window-chrome')! as HTMLElement
      chrome.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: x as number,
        clientY: y as number,
        bubbles: true,
        composed: true,
        pointerId: 1,
      }))
    }, [firstId!, chromePos.x, chromePos.y] as const)

    await mainWindow.mouse.move(chromePos.x + 20, chromePos.y + 20, { steps: 3 })
    await mainWindow.mouse.up()
    await mainWindow.waitForTimeout(500)

    const firstAfter = await getWindowStyle(mainWindow, firstId!)
    const secondAfter = await getWindowStyle(mainWindow, secondId!)
    expect(firstAfter.zIndex).toBeGreaterThan(secondAfter.zIndex)
  })

  test('window gets dragging class during drag', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const chrome = terminalWindow.first().locator('.window-chrome')
    const chromeBbox = await chrome.boundingBox()
    expect(chromeBbox).toBeTruthy()

    const startX = chromeBbox!.x + chromeBbox!.width / 2
    const startY = chromeBbox!.y + chromeBbox!.height / 2

    await mainWindow.mouse.move(startX, startY)
    await mainWindow.mouse.down()
    await mainWindow.mouse.move(startX + 40, startY + 40, { steps: 5 })

    await mainWindow.waitForTimeout(100)

    const draggingWindow = mainWindow.locator('.terminal-window.dragging')
    const hasDragging = await draggingWindow.count()
    expect(hasDragging).toBeGreaterThanOrEqual(1)

    await mainWindow.mouse.up()
    await mainWindow.waitForTimeout(300)

    const stillDragging = await draggingWindow.count()
    expect(stillDragging).toBe(0)
  })
})
