import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Create a minimal valid PNG file (1x1 red pixel).
 */
function createMinimalPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  )
}

/**
 * Create a simple SVG file with specified dimensions.
 */
function createSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ff0000"/>
  <text x="10" y="30" fill="white" font-size="20">Test</text>
</svg>`
}

function createTempDir(): string {
  const dir = path.join(os.homedir(), 'smoke-e2e-test', `img-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function createTempImage(dir: string, name: string, content: Buffer | string): string {
  const filePath = path.join(dir, name)
  if (typeof content === 'string') {
    fs.writeFileSync(filePath, content, 'utf-8')
  } else {
    fs.writeFileSync(filePath, content)
  }
  return filePath
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

/** Close all sessions by removing them from the store directly.
 *  This is safer than clicking close buttons which can crash the app
 *  when PTY processes from worktrees are being killed. */
async function closeAllSessions(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as any).__SMOKE_STORES__?.sessionStore
    if (!store) return
    const sessions = store.getState().sessions
    for (const [id, session] of sessions) {
      // Kill PTY for terminal sessions
      if ((session as any).type === 'terminal' && window.smokeAPI?.pty?.kill) {
        try { window.smokeAPI.pty.kill(id) } catch { /* ignore */ }
      }
      store.getState().removeSession(id)
    }
  })
  await page.waitForTimeout(300)
}

/**
 * Reset canvas viewport to pan=(0,0), zoom=1 so that canvas coordinates
 * map directly to screen coordinates within the canvas container.
 */
async function resetViewport(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const viewport = document.querySelector('.canvas-viewport') as HTMLElement
    if (viewport) {
      viewport.style.transform = 'translate3d(0px, 0px, 0) scale(1)'
    }
  })
  await page.waitForTimeout(100)
}

/**
 * Open an image in the image viewer via sessionStore.
 * Creates the session at a given canvas position (default 50,50).
 */
async function openImageViewer(
  page: import('@playwright/test').Page,
  filePath: string,
  position = { x: 50, y: 50 }
): Promise<string> {
  return page.evaluate(async ({ fp, pos }) => {
    const result = await window.smokeAPI.fs.readfileBase64(fp)
    const store = (window as any).__SMOKE_STORES__?.sessionStore
    if (!store) throw new Error('sessionStore not found')

    // Load image dimensions
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = result.dataUrl
    })

    const session = store.getState().createImageSession(
      fp,
      result.dataUrl,
      dims.width,
      dims.height,
      pos
    )
    store.getState().focusSession(session.id)
    store.getState().bringToFront(session.id)
    return session.id
  }, { fp: filePath, pos: position })
}

/** Read position, size, and zIndex from the DOM style of a window. */
async function getWindowStyle(
  page: import('@playwright/test').Page,
  sessionId: string
): Promise<{ left: number; top: number; width: number; height: number; zIndex: number }> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"]`) as HTMLElement
    return {
      left: parseFloat(el.style.left) || 0,
      top: parseFloat(el.style.top) || 0,
      width: parseFloat(el.style.width) || 0,
      height: parseFloat(el.style.height) || 0,
      zIndex: parseInt(el.style.zIndex, 10) || 0,
    }
  }, sessionId)
}

/** Get image session data from Zustand store */
async function getImageSession(
  page: import('@playwright/test').Page,
  sessionId: string
): Promise<{ aspectRatio: number; naturalWidth: number; naturalHeight: number; width: number; height: number }> {
  return page.evaluate((id) => {
    const store = (window as any).__SMOKE_STORES__?.sessionStore
    const session = store.getState().sessions.get(id)
    return {
      aspectRatio: session.aspectRatio,
      naturalWidth: session.naturalWidth,
      naturalHeight: session.naturalHeight,
      width: session.size.width,
      height: session.size.height,
    }
  }, sessionId)
}

/**
 * Initiate a resize on an image window using standard Playwright mouse API.
 * Disables pointer-events on the image body so the resize handle is clickable
 * (same pattern as window-drag-resize.spec.ts).
 */
async function startResize(
  page: import('@playwright/test').Page,
  sessionId: string,
  direction: 'e' | 's' | 'se'
): Promise<{ startX: number; startY: number }> {
  const pos = await page.evaluate(([id, dir]) => {
    const windowEl = document.querySelector(`[data-session-id="${id}"]`)!
    const handle = windowEl.querySelector(`.resize-handle-${dir}`)!
    const rect = handle.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }, [sessionId, direction] as const)

  // Disable pointer-events on image body so the resize handle is clickable
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"] .image-body`) as HTMLElement
    if (el) el.style.pointerEvents = 'none'
  }, sessionId)

  // Standard Playwright mouse: move to handle, press down
  await page.mouse.move(pos.x, pos.y)
  await page.mouse.down()

  // Restore pointer-events
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"] .image-body`) as HTMLElement
    if (el) el.style.pointerEvents = ''
  }, sessionId)

  return { startX: pos.x, startY: pos.y }
}

test.describe('Image Viewer: Open, Render, Drag, and Resize', () => {
  let tempDir: string

  test.beforeEach(() => {
    tempDir = createTempDir()
  })

  test.afterEach(() => {
    cleanupDir(tempDir)
  })

  test('open PNG image and verify it renders on canvas', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    const pngPath = createTempImage(tempDir, 'test.png', createMinimalPng())
    const sessionId = await openImageViewer(mainWindow, pngPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })
    await expect(imageWindow).toHaveClass(/focused/)

    const img = imageWindow.locator('.image-content')
    await expect(img).toBeVisible({ timeout: 3000 })

    const src = await img.getAttribute('src')
    expect(src).toBeTruthy()
    expect(src).toMatch(/^data:image\//)
  })

  test('open JPG image and verify it renders', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    // Use valid PNG bytes with .jpg extension — the MIME type comes from the
    // file extension in readfileBase64, and the browser's Image() decodes
    // the actual content (PNG) regardless of the data-URL MIME. This tests
    // the full JPG flow without needing a valid JPEG encoder.
    const jpgPath = createTempImage(tempDir, 'test.jpg', createMinimalPng())
    const sessionId = await openImageViewer(mainWindow, jpgPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })

    const img = imageWindow.locator('.image-content')
    await expect(img).toBeVisible({ timeout: 3000 })

    const src = await img.getAttribute('src')
    expect(src).toBeTruthy()
    expect(src).toMatch(/^data:image\//)
  })

  test('open SVG image and verify it renders', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    const svgPath = createTempImage(tempDir, 'test.svg', createSvg(300, 200))
    const sessionId = await openImageViewer(mainWindow, svgPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })

    const img = imageWindow.locator('.image-content')
    await expect(img).toBeVisible({ timeout: 3000 })

    const src = await img.getAttribute('src')
    expect(src).toBeTruthy()
    expect(src).toMatch(/^data:image\//)
  })

  test('image window shows correct title from file path', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    const pngPath = createTempImage(tempDir, 'my-photo.png', createMinimalPng())
    const sessionId = await openImageViewer(mainWindow, pngPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })

    const title = imageWindow.locator('.window-chrome-title')
    const titleText = await title.inputValue().catch(() => title.textContent())
    expect(titleText).toContain('my-photo.png')
  })

  test('drag image window by title bar updates position', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    const svgPath = createTempImage(tempDir, 'drag-test.svg', createSvg(200, 150))
    const sessionId = await openImageViewer(mainWindow, svgPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })

    const before = await getWindowStyle(mainWindow, sessionId)

    // Drag via standard Playwright mouse API on the chrome bar
    const chrome = imageWindow.locator('.window-chrome')
    const chromeBbox = await chrome.boundingBox()
    expect(chromeBbox).toBeTruthy()

    const startX = chromeBbox!.x + chromeBbox!.width / 2
    const startY = chromeBbox!.y + chromeBbox!.height / 2

    await mainWindow.mouse.move(startX, startY)
    await mainWindow.mouse.down()
    await mainWindow.mouse.move(startX + 120, startY + 80, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId)

    expect(after.left).toBeGreaterThan(before.left)
    expect(after.top).toBeGreaterThan(before.top)
  })

  test('resize image via southeast handle preserves aspect ratio', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    // 2:1 aspect ratio SVG
    const svgPath = createTempImage(tempDir, 'resize-ar.svg', createSvg(300, 150))
    const sessionId = await openImageViewer(mainWindow, svgPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })

    const beforeSession = await getImageSession(mainWindow, sessionId)
    const aspectRatio = beforeSession.aspectRatio

    const start = await startResize(mainWindow, sessionId, 'se')
    await mainWindow.mouse.move(start.startX + 100, start.startY + 50, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const afterSession = await getImageSession(mainWindow, sessionId)

    // Size should have changed
    expect(afterSession.width).not.toBe(beforeSession.width)

    // Aspect ratio should be preserved (within grid-snapping tolerance)
    const newRatio = afterSession.width / afterSession.height
    expect(newRatio).toBeGreaterThan(aspectRatio * 0.85)
    expect(newRatio).toBeLessThan(aspectRatio * 1.15)
  })

  test('resize image via east handle preserves aspect ratio', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    const svgPath = createTempImage(tempDir, 'resize-e.svg', createSvg(300, 150))
    const sessionId = await openImageViewer(mainWindow, svgPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })

    const beforeSession = await getImageSession(mainWindow, sessionId)
    const aspectRatio = beforeSession.aspectRatio

    const start = await startResize(mainWindow, sessionId, 'e')
    await mainWindow.mouse.move(start.startX + 80, start.startY, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const afterSession = await getImageSession(mainWindow, sessionId)

    expect(afterSession.width).toBeGreaterThan(beforeSession.width)
    expect(afterSession.height).toBeGreaterThan(beforeSession.height)

    const newRatio = afterSession.width / afterSession.height
    expect(newRatio).toBeGreaterThan(aspectRatio * 0.85)
    expect(newRatio).toBeLessThan(aspectRatio * 1.15)
  })

  test('resize image snaps to grid', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    const DEFAULT_GRID_SIZE = 20

    const svgPath = createTempImage(tempDir, 'resize-snap.svg', createSvg(300, 200))
    const sessionId = await openImageViewer(mainWindow, svgPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })

    const start = await startResize(mainWindow, sessionId, 'se')
    await mainWindow.mouse.move(start.startX + 73, start.startY + 47, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const afterSession = await getImageSession(mainWindow, sessionId)

    expect(afterSession.width % DEFAULT_GRID_SIZE).toBe(0)
    expect(afterSession.height % DEFAULT_GRID_SIZE).toBe(0)
  })

  test('image has minimum size constraint during resize', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    const svgPath = createTempImage(tempDir, 'resize-min.svg', createSvg(300, 200))
    const sessionId = await openImageViewer(mainWindow, svgPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })

    const start = await startResize(mainWindow, sessionId, 'se')
    await mainWindow.mouse.move(start.startX - 500, start.startY - 500, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const afterSession = await getImageSession(mainWindow, sessionId)

    expect(afterSession.width).toBeGreaterThanOrEqual(100)
    expect(afterSession.height).toBeGreaterThanOrEqual(100)
  })

  test('close image window via close button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    const pngPath = createTempImage(tempDir, 'close-test.png', createMinimalPng())
    const sessionId = await openImageViewer(mainWindow, pngPath)

    const imageWindow = mainWindow.locator(`.image-window[data-session-id="${sessionId}"]`)
    await expect(imageWindow).toBeVisible({ timeout: 5000 })

    const closeBtn = imageWindow.locator('.window-chrome-close')
    await closeBtn.click({ force: true })

    await expect(imageWindow).toHaveCount(0, { timeout: 5000 })
  })

  test('open multiple images of different formats', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)
    await resetViewport(mainWindow)

    const pngPath = createTempImage(tempDir, 'multi.png', createMinimalPng())
    const svgPath = createTempImage(tempDir, 'multi.svg', createSvg(200, 100))
    // Use PNG bytes with .jpg extension for JPEG format test
    const jpgPath = createTempImage(tempDir, 'multi.jpg', createMinimalPng())

    const pngId = await openImageViewer(mainWindow, pngPath, { x: 50, y: 50 })
    const svgId = await openImageViewer(mainWindow, svgPath, { x: 400, y: 50 })
    const jpgId = await openImageViewer(mainWindow, jpgPath, { x: 50, y: 300 })

    const imageWindows = mainWindow.locator('.image-window')
    await expect(imageWindows).toHaveCount(3, { timeout: 5000 })

    const ids = new Set([pngId, svgId, jpgId])
    expect(ids.size).toBe(3)

    for (const id of [pngId, svgId, jpgId]) {
      const win = mainWindow.locator(`.image-window[data-session-id="${id}"]`)
      const img = win.locator('.image-content')
      await expect(img).toBeVisible({ timeout: 3000 })
    }
  })
})
