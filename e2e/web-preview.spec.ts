import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'

/**
 * Helper: read position, size from the DOM style of a webview window.
 */
async function getWindowStyle(
  page: import('@playwright/test').Page,
  sessionId: string
): Promise<{ left: number; top: number; width: number; height: number }> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"]`) as HTMLElement
    const style = el.style
    return {
      left: parseFloat(style.left) || 0,
      top: parseFloat(style.top) || 0,
      width: parseFloat(style.width) || 0,
      height: parseFloat(style.height) || 0,
    }
  }, sessionId)
}

/**
 * Helper: clear all sessions via the store (avoids X-button click issues).
 */
async function clearAllSessions(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
    const ids = Array.from(store.sessions.keys()) as string[]
    for (const id of ids) {
      store.removeSession(id)
    }
  })
  await page.waitForTimeout(300)
}

/**
 * Helper: create a webview session programmatically and return its session ID.
 */
async function createWebviewSession(
  page: import('@playwright/test').Page,
  url?: string
): Promise<string> {
  const sessionId = await page.evaluate((u) => {
    const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
    const session = store.createWebviewSession(u, { x: 40, y: 40 })
    store.focusSession(session.id)
    return session.id
  }, url)

  await page.waitForTimeout(500)

  const webviewWindow = page.locator(`[data-session-id="${sessionId}"]`)
  await expect(webviewWindow).toBeVisible({ timeout: 5000 })

  return sessionId
}

/**
 * Helper: dispatch a pointerdown on a resize handle via dispatchEvent,
 * bypassing any overlapping elements (minimap, webview body, etc.).
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
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2

    // Dispatch pointerdown directly on the handle to bypass overlapping elements
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: x,
      clientY: y,
      bubbles: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
    }))

    return { x, y }
  }, [sessionId, direction] as const)

  // Move the mouse to the handle position so subsequent mouse.move works
  await page.mouse.move(pos.x, pos.y)

  return { startX: pos.x, startY: pos.y }
}

/** Default grid size used by the app */
const DEFAULT_GRID_SIZE = 20

test.describe('Web Preview Element', () => {
  test('create web preview via sidebar button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    // Click the "+ Web" sidebar button
    const webBtn = mainWindow.locator('.sidebar-new-btn', { hasText: '+ Web' })
    await expect(webBtn).toBeVisible({ timeout: 5000 })
    await webBtn.click()
    await mainWindow.waitForTimeout(1000)

    // A new webview window should appear
    const webviewWindows = mainWindow.locator('.webview-window')
    await expect(webviewWindows).toHaveCount(1, { timeout: 5000 })

    // Verify the webview has correct default structure
    const webview = webviewWindows.first()
    await expect(webview).toBeVisible()

    // Should have navigation bar with back/forward/refresh buttons and URL input
    const navBar = webview.locator('.webview-nav-bar')
    await expect(navBar).toBeVisible()

    const navBtns = webview.locator('.webview-nav-btn')
    await expect(navBtns).toHaveCount(3) // back, forward, refresh

    const urlInput = webview.locator('.webview-url-input')
    await expect(urlInput).toBeVisible()

    // Default URL should be http://localhost:3000
    await expect(urlInput).toHaveValue('http://localhost:3000')

    // Should have a webview element
    const webviewFrame = webview.locator('webview.webview-frame')
    await expect(webviewFrame).toBeAttached()

    // Should have resize handles
    await expect(webview.locator('.resize-handle-se')).toBeAttached()
    await expect(webview.locator('.resize-handle-e')).toBeAttached()
    await expect(webview.locator('.resize-handle-s')).toBeAttached()
  })

  test('webview session appears in sidebar and store', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)

    // Session list should have the webview
    const sessionItems = mainWindow.locator('.session-list-item')
    await expect(sessionItems).toHaveCount(1, { timeout: 5000 })

    // The session item should show the URL
    const urlDisplay = sessionItems.last().locator('.session-cwd')
    await expect(urlDisplay).toHaveText('http://localhost:3000')

    // Verify store state
    const sessionData = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      const session = store.sessions.get(id)
      return session ? {
        type: session.type,
        url: session.url,
        canGoBack: session.canGoBack,
        canGoForward: session.canGoForward,
        width: session.size.width,
        height: session.size.height,
      } : null
    }, sessionId)

    expect(sessionData).not.toBeNull()
    expect(sessionData!.type).toBe('webview')
    expect(sessionData!.url).toBe('http://localhost:3000')
    expect(sessionData!.canGoBack).toBe(false)
    expect(sessionData!.canGoForward).toBe(false)
    expect(sessionData!.width).toBe(800)
    expect(sessionData!.height).toBe(600)
  })

  test('enter URL in address bar and navigate', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)
    const webview = mainWindow.locator(`[data-session-id="${sessionId}"]`)

    const urlInput = webview.locator('.webview-url-input')
    await urlInput.click()
    await urlInput.fill('https://example.com')
    await urlInput.press('Enter')
    await mainWindow.waitForTimeout(3000)

    // After navigation, the browser may add a trailing slash via did-navigate
    const urlValue = await urlInput.inputValue()
    expect(urlValue).toMatch(/^https:\/\/example\.com\/?$/)

    // Store should be updated
    const storeUrl = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.url
    }, sessionId)

    expect(storeUrl).toMatch(/^https:\/\/example\.com\/?$/)
  })

  test('URL normalization — auto-adds http:// prefix', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)
    const webview = mainWindow.locator(`[data-session-id="${sessionId}"]`)

    const urlInput = webview.locator('.webview-url-input')
    await urlInput.click()
    await urlInput.fill('example.com')
    await urlInput.press('Enter')
    await mainWindow.waitForTimeout(3000)

    // URL should have been normalized; browser may redirect http→https and/or add trailing slash
    const urlValue = await urlInput.inputValue()
    expect(urlValue).toMatch(/^https?:\/\/example\.com\/?$/)

    const storeUrl = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.url
    }, sessionId)

    expect(storeUrl).toMatch(/^https?:\/\/example\.com\/?$/)
  })

  test('URL validation rejects empty input', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)
    const webview = mainWindow.locator(`[data-session-id="${sessionId}"]`)
    const urlInput = webview.locator('.webview-url-input')

    // Clear URL and press Enter — normalizeUrl returns '' so navigateTo does nothing
    await urlInput.click()
    await urlInput.fill('')
    await urlInput.press('Enter')
    await mainWindow.waitForTimeout(300)

    // Store URL should still be the original default
    const storeUrl = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.url
    }, sessionId)

    expect(storeUrl).toBe('http://localhost:3000')
  })

  test('navigation controls state', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)
    const webview = mainWindow.locator(`[data-session-id="${sessionId}"]`)

    // Back and Forward should be disabled initially
    const backBtn = webview.locator('.webview-nav-btn').first()
    const forwardBtn = webview.locator('.webview-nav-btn').nth(1)
    const refreshBtn = webview.locator('.webview-nav-btn').nth(2)

    await expect(backBtn).toBeDisabled()
    await expect(forwardBtn).toBeDisabled()

    // Refresh button should be enabled and clickable
    await expect(refreshBtn).toBeVisible()
    await expect(refreshBtn).toBeEnabled()
    await refreshBtn.click()
    await mainWindow.waitForTimeout(500)
  })

  test('change URL updates store', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)
    const webview = mainWindow.locator(`[data-session-id="${sessionId}"]`)
    const urlInput = webview.locator('.webview-url-input')

    // Navigate to a URL
    await urlInput.click()
    await urlInput.fill('https://example.com')
    await urlInput.press('Enter')
    await mainWindow.waitForTimeout(3000)

    // Store should have been updated from default
    const storeUrl = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.url
    }, sessionId)

    expect(storeUrl).not.toBe('http://localhost:3000')
    expect(storeUrl).toMatch(/example\.com/)
  })

  test('resize webview via southeast handle', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)

    const before = await getWindowStyle(mainWindow, sessionId)
    expect(before.width).toBe(800)
    expect(before.height).toBe(600)

    const start = await startResize(mainWindow, sessionId, 'se')

    await mainWindow.mouse.move(start.startX + 100, start.startY + 80, { steps: 10 })
    await mainWindow.mouse.up()
    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId)
    expect(after.width).toBeGreaterThan(before.width)
    expect(after.height).toBeGreaterThan(before.height)

    // Should snap to grid
    expect(after.width % DEFAULT_GRID_SIZE).toBe(0)
    expect(after.height % DEFAULT_GRID_SIZE).toBe(0)
  })

  test('resize webview via east handle changes width only', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)

    const before = await getWindowStyle(mainWindow, sessionId)

    const start = await startResize(mainWindow, sessionId, 'e')

    await mainWindow.mouse.move(start.startX + 120, start.startY, { steps: 10 })
    await mainWindow.mouse.up()
    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId)
    expect(after.width).toBeGreaterThan(before.width)
    expect(after.height).toBe(before.height)
  })

  test('close webview via X button removes from DOM and store', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)

    const webviewWindows = mainWindow.locator('.webview-window')
    await expect(webviewWindows).toHaveCount(1, { timeout: 5000 })

    // Close via the chrome X button
    const closeBtn = webviewWindows.first().locator('.window-chrome-close')
    await closeBtn.click({ force: true })
    await mainWindow.waitForTimeout(500)

    await expect(webviewWindows).toHaveCount(0, { timeout: 5000 })

    // Verify removed from store
    const exists = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.has(id)
    }, sessionId)

    expect(exists).toBe(false)
  })

  test('create multiple webview sessions with unique IDs', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    // Create three webview sessions
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const id = await mainWindow.evaluate((idx) => {
        const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
        const session = store.createWebviewSession('http://localhost:3000', { x: 40 + idx * 100, y: 40 })
        return session.id
      }, i)
      ids.push(id)
    }

    await mainWindow.waitForTimeout(500)

    const webviewWindows = mainWindow.locator('.webview-window')
    await expect(webviewWindows).toHaveCount(3, { timeout: 5000 })

    // All should have unique session IDs
    expect(new Set(ids).size).toBe(3)
  })

  test('webview has focused class and correct default URL', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)
    const webview = mainWindow.locator(`[data-session-id="${sessionId}"]`)

    // Should be focused after creation
    await expect(webview).toHaveClass(/focused/)

    // Default URL is localhost:3000
    const storeUrl = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.url
    }, sessionId)
    expect(storeUrl).toBe('http://localhost:3000')
  })

  test('https URL via store creates correct session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow, 'https://example.com')

    const webview = mainWindow.locator(`[data-session-id="${sessionId}"]`)
    await expect(webview).toBeVisible({ timeout: 5000 })

    // Store should have the https URL
    const storeUrl = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.url
    }, sessionId)

    expect(storeUrl).toMatch(/^https:\/\/example\.com\/?$/)
  })

  test('webview popups are blocked and has running status', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await clearAllSessions(mainWindow)

    const sessionId = await createWebviewSession(mainWindow)
    const webview = mainWindow.locator(`[data-session-id="${sessionId}"]`)

    // Verify allowpopups attribute is set to false
    const allowPopups = await webview.locator('webview.webview-frame').getAttribute('allowpopups')
    expect(allowPopups).toBe('false')

    // WindowChrome should show "running" status
    const statusDot = webview.locator('.window-chrome-status.running')
    await expect(statusDot).toBeVisible({ timeout: 5000 })
  })
})
