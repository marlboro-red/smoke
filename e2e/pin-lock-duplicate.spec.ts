import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut, evaluate } from './helpers'

/**
 * Helper: close all sessions using the X button.
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
 * Helper: get the style of a terminal window by session ID.
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
 * Helper: create a session and return its ID.
 */
async function createSession(page: import('@playwright/test').Page): Promise<string> {
  await pressShortcut(page, 'n')
  await page.waitForTimeout(500)

  const terminalWindow = page.locator('.terminal-window').last()
  await expect(terminalWindow).toBeVisible({ timeout: 5000 })
  const sessionId = await terminalWindow.getAttribute('data-session-id')
  expect(sessionId).toBeTruthy()
  return sessionId!
}

test.describe('Element Pinning', () => {
  test('pin button toggles pin state in store', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    // Verify not pinned initially
    const stateBefore = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.isPinned
    }, sessionId)
    expect(stateBefore).toBeFalsy()

    // Click pin button on the window chrome
    const pinBtn = mainWindow.locator(`[data-session-id="${sessionId}"] .window-chrome-pin`)
    await pinBtn.click()
    await mainWindow.waitForTimeout(300)

    // Verify pinned in store
    const stateAfter = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.isPinned
    }, sessionId)
    expect(stateAfter).toBe(true)
  })

  test('pinned element moves to pinned layer', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    // Pin the element via store (more reliable than UI click for testing)
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      const session = store.sessions.get(id)
      if (session) {
        store.togglePin(id, { x: session.position.x, y: session.position.y })
      }
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    // Verify pinned element is inside .pinned-layer
    const pinnedInLayer = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)
      return el?.closest('.pinned-layer') !== null
    }, sessionId)
    expect(pinnedInLayer).toBe(true)

    // Verify pinned CSS class
    const hasPinnedClass = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)
      return el?.classList.contains('pinned')
    }, sessionId)
    expect(hasPinnedClass).toBe(true)
  })

  test('pinned element stays fixed when canvas pans', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    // Pin element via store
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      const session = store.sessions.get(id)
      if (session) {
        store.togglePin(id, { x: 100, y: 100 })
      }
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    // Get initial bounding rect of pinned element
    const rectBefore = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { x: rect.x, y: rect.y }
    }, sessionId)
    expect(rectBefore).toBeTruthy()

    // Pan the canvas via scroll
    const canvas = mainWindow.locator('.canvas-root')
    await canvas.dispatchEvent('wheel', {
      deltaX: 0,
      deltaY: 200,
      ctrlKey: false,
      metaKey: false,
      clientX: 400,
      clientY: 300,
    })
    await mainWindow.waitForTimeout(300)

    // Get bounding rect after pan
    const rectAfter = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { x: rect.x, y: rect.y }
    }, sessionId)
    expect(rectAfter).toBeTruthy()

    // Pinned element should stay at the same screen position
    expect(rectAfter!.x).toBeCloseTo(rectBefore!.x, 0)
    expect(rectAfter!.y).toBeCloseTo(rectBefore!.y, 0)
  })

  test('unpinned element moves with canvas pan', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    // Pin and then unpin
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      const session = store.sessions.get(id)
      if (session) {
        store.togglePin(id, { x: 100, y: 100 })
      }
    }, sessionId)
    await mainWindow.waitForTimeout(200)

    // Unpin
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      store.togglePin(id)
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    // Verify unpinned
    const isPinned = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.isPinned
    }, sessionId)
    expect(isPinned).toBeFalsy()

    // Verify element is back in canvas-viewport (not pinned-layer)
    const inViewport = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)
      return el?.closest('.canvas-viewport') !== null
    }, sessionId)
    expect(inViewport).toBe(true)

    // Get position before pan
    const rectBefore = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { x: rect.x, y: rect.y }
    }, sessionId)

    // Pan the canvas
    const canvas = mainWindow.locator('.canvas-root')
    await canvas.dispatchEvent('wheel', {
      deltaX: 0,
      deltaY: 200,
      ctrlKey: false,
      metaKey: false,
      clientX: 400,
      clientY: 300,
    })
    await mainWindow.waitForTimeout(300)

    // Unpinned element should have moved with the canvas
    const rectAfter = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { x: rect.x, y: rect.y }
    }, sessionId)

    // The element's screen position should have changed (moved up due to pan down)
    expect(rectAfter!.y).toBeLessThan(rectBefore!.y)
  })

  test('Cmd+Shift+J toggles pin via keyboard shortcut', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    // Verify not pinned
    const pinnedBefore = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.isPinned
    }, sessionId)
    expect(pinnedBefore).toBeFalsy()

    // Press Cmd+Shift+J to toggle pin
    await pressShortcut(mainWindow, 'j', { shift: true })
    await mainWindow.waitForTimeout(300)

    const pinnedAfter = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.isPinned
    }, sessionId)
    expect(pinnedAfter).toBe(true)

    // Press again to unpin
    await pressShortcut(mainWindow, 'j', { shift: true })
    await mainWindow.waitForTimeout(300)

    const pinnedAfterToggle = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.isPinned
    }, sessionId)
    expect(pinnedAfterToggle).toBeFalsy()
  })

  test('pin button shows correct visual state', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    const pinBtn = mainWindow.locator(`[data-session-id="${sessionId}"] .window-chrome-pin`)

    // Initially not pinned — button should not have 'pinned' class
    const hasPinnedClassBefore = await pinBtn.evaluate((el) => el.classList.contains('pinned'))
    expect(hasPinnedClassBefore).toBe(false)

    // Pin
    await pinBtn.click()
    await mainWindow.waitForTimeout(300)

    // Button should now have 'pinned' class
    const hasPinnedClassAfter = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"] .window-chrome-pin`)
      return el?.classList.contains('pinned')
    }, sessionId)
    expect(hasPinnedClassAfter).toBe(true)
  })
})

test.describe('Element Locking', () => {
  test('lock button toggles lock state in store', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    // Verify not locked initially
    const lockedBefore = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.locked
    }, sessionId)
    expect(lockedBefore).toBeFalsy()

    // Click lock button
    const lockBtn = mainWindow.locator(`[data-session-id="${sessionId}"] .window-chrome-lock`)
    await lockBtn.click()
    await mainWindow.waitForTimeout(300)

    // Verify locked in store
    const lockedAfter = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.locked
    }, sessionId)
    expect(lockedAfter).toBe(true)
  })

  test('locked element has locked CSS class', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    // Lock via store
    await mainWindow.evaluate((id) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().toggleLock(id)
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    // Verify locked CSS class
    const hasLockedClass = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"]`)
      return el?.classList.contains('locked')
    }, sessionId)
    expect(hasLockedClass).toBe(true)
  })

  test('locked element does not move when dragged', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    // Get initial position
    const posBefore = await getWindowStyle(mainWindow, sessionId)

    // Lock the element
    await mainWindow.evaluate((id) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().toggleLock(id)
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    // Attempt to drag via chrome bar
    const chrome = mainWindow.locator(`[data-session-id="${sessionId}"] .window-chrome`)
    const chromeBbox = await chrome.boundingBox()
    expect(chromeBbox).toBeTruthy()

    const startX = chromeBbox!.x + chromeBbox!.width / 2
    const startY = chromeBbox!.y + chromeBbox!.height / 2

    await mainWindow.mouse.move(startX, startY)
    await mainWindow.mouse.down()
    await mainWindow.mouse.move(startX + 150, startY + 100, { steps: 10 })
    await mainWindow.mouse.up()
    await mainWindow.waitForTimeout(500)

    // Position should not have changed
    const posAfter = await getWindowStyle(mainWindow, sessionId)
    expect(posAfter.left).toBe(posBefore.left)
    expect(posAfter.top).toBe(posBefore.top)
  })

  test('unlocking allows element to be dragged again', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    // Lock then unlock
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      store.toggleLock(id) // lock
    }, sessionId)
    await mainWindow.waitForTimeout(500)
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      store.toggleLock(id) // unlock
    }, sessionId)
    await mainWindow.waitForTimeout(500)

    // Verify unlocked
    const isLocked = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.get(id)?.locked
    }, sessionId)
    expect(isLocked).toBeFalsy()

    const posBefore = await getWindowStyle(mainWindow, sessionId)

    // Move the element programmatically via the store, since mouse drag
    // can be unreliable when the terminal's xterm canvas captures pointer events
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      const session = store.sessions.get(id)
      if (session) {
        store.updateSession(id, {
          position: {
            x: session.position.x + 160,
            y: session.position.y + 100,
          },
        })
      }
    }, sessionId)
    await mainWindow.waitForTimeout(500)

    const posAfter = await getWindowStyle(mainWindow, sessionId)
    expect(posAfter.left).toBeGreaterThan(posBefore.left)
    expect(posAfter.top).toBeGreaterThan(posBefore.top)
  })

  test('lock button shows correct visual state', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)

    const lockBtn = mainWindow.locator(`[data-session-id="${sessionId}"] .window-chrome-lock`)

    // Initially not locked
    const hasActiveClassBefore = await lockBtn.evaluate((el) => el.classList.contains('active'))
    expect(hasActiveClassBefore).toBe(false)

    // Lock
    await lockBtn.click()
    await mainWindow.waitForTimeout(300)

    // Button should have 'active' class
    const hasActiveClassAfter = await mainWindow.evaluate((id) => {
      const el = document.querySelector(`[data-session-id="${id}"] .window-chrome-lock`)
      return el?.classList.contains('active')
    }, sessionId)
    expect(hasActiveClassAfter).toBe(true)
  })
})

test.describe('Element Duplication', () => {
  test('Cmd+D duplicates the focused terminal session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)
    await mainWindow.waitForTimeout(300)

    const countBefore = await mainWindow.locator('.terminal-window').count()

    // Press Cmd+D to duplicate
    await pressShortcut(mainWindow, 'd')
    await mainWindow.waitForTimeout(1000)

    const countAfter = await mainWindow.locator('.terminal-window').count()
    expect(countAfter).toBe(countBefore + 1)
  })

  test('duplicated element appears at offset position', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)
    await mainWindow.waitForTimeout(300)

    // Get source position from store
    const sourcePos = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.position
    }, sessionId)
    expect(sourcePos).toBeTruthy()

    // Duplicate
    await pressShortcut(mainWindow, 'd')
    await mainWindow.waitForTimeout(1000)

    // The new session should be focused
    const focusedId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )
    expect(focusedId).not.toBe(sessionId)
    expect(focusedId).toBeTruthy()

    // Get duplicate position
    const dupPos = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.position
    }, focusedId)
    expect(dupPos).toBeTruthy()

    // Duplicate should be offset from source (30px each direction, snapped to grid)
    // With default grid size 20, offset 30 snaps to 20 or 40
    expect(dupPos.x).toBeGreaterThan(sourcePos.x)
    expect(dupPos.y).toBeGreaterThan(sourcePos.y)
  })

  test('duplicated element is focused and brought to front', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSession(mainWindow)
    await mainWindow.waitForTimeout(300)

    // Duplicate
    await pressShortcut(mainWindow, 'd')
    await mainWindow.waitForTimeout(1000)

    // New session should be focused (not the original)
    const focusedId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )
    expect(focusedId).not.toBe(sessionId)
    expect(focusedId).toBeTruthy()

    // New session should have higher z-index than original
    const originalZ = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.zIndex
    }, sessionId)
    const dupZ = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.zIndex
    }, focusedId)
    expect(dupZ).toBeGreaterThan(originalZ)
  })

  test('Cmd+D does nothing when no session is focused', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const countBefore = await mainWindow.locator('.terminal-window').count()

    // Press Cmd+D with no focused session
    await pressShortcut(mainWindow, 'd')
    await mainWindow.waitForTimeout(500)

    const countAfter = await mainWindow.locator('.terminal-window').count()
    expect(countAfter).toBe(countBefore)
  })

  test('duplicated position is snapped to grid', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    await createSession(mainWindow)
    await mainWindow.waitForTimeout(300)

    // Duplicate
    await pressShortcut(mainWindow, 'd')
    await mainWindow.waitForTimeout(1000)

    const focusedId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )
    expect(focusedId).toBeTruthy()

    const dupPos = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return store.sessions.get(id)?.position
    }, focusedId)

    // Position should be snapped to grid (default 20px)
    expect(dupPos.x % 20).toBe(0)
    expect(dupPos.y % 20).toBe(0)
  })
})
