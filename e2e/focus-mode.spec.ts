import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * Helper: create three notes and a connector from note1 → note2.
 * Returns the session IDs of all three notes.
 */
async function setupFocusModeScene(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const stores = (window as any).__SMOKE_STORES__
    const ss = stores.sessionStore.getState()
    const note1 = ss.createNoteSession({ x: 100, y: 100 })
    const note2 = ss.createNoteSession({ x: 500, y: 100 })
    const note3 = ss.createNoteSession({ x: 300, y: 400 })
    // Connect note1 → note2
    stores.connectorStore.getState().addConnector(note1.id, note2.id, {
      color: '#ff0000',
    })
    // Focus note1
    ss.focusSession(note1.id)
    return { id1: note1.id, id2: note2.id, id3: note3.id }
  })
}

test.describe('Focus Mode', () => {
  test('toggle focus mode on and off via store', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ids = await setupFocusModeScene(mainWindow)

    // Verify focus mode is off initially
    const enabledBefore = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      return stores.focusModeStore.getState().enabled
    })
    expect(enabledBefore).toBe(false)

    // No elements should be dimmed when focus mode is off
    const dimmedBefore = await mainWindow.locator('.focus-mode-dimmed').count()
    expect(dimmedBefore).toBe(0)

    // Enable focus mode
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.focusModeStore.getState().toggle()
    })

    const enabledAfter = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      return stores.focusModeStore.getState().enabled
    })
    expect(enabledAfter).toBe(true)

    // note3 (not connected to focused note1) should be dimmed
    const note3El = mainWindow.locator(`[data-session-id="${ids.id3}"]`)
    await expect(note3El).toHaveClass(/focus-mode-dimmed/, { timeout: 3000 })

    // Toggle off
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.focusModeStore.getState().toggle()
    })

    const enabledOff = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      return stores.focusModeStore.getState().enabled
    })
    expect(enabledOff).toBe(false)

    // No elements should be dimmed now
    const dimmedAfterOff = await mainWindow.locator('.focus-mode-dimmed').count()
    expect(dimmedAfterOff).toBe(0)
  })

  test('focused element and connected elements remain visible, others dimmed', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ids = await setupFocusModeScene(mainWindow)

    // Enable focus mode (note1 is focused, connected to note2)
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.focusModeStore.getState().toggle()
    })

    // note1 (focused) should NOT be dimmed
    const note1El = mainWindow.locator(`[data-session-id="${ids.id1}"]`)
    await expect(note1El).not.toHaveClass(/focus-mode-dimmed/, { timeout: 3000 })

    // note2 (connected to focused note1) should NOT be dimmed
    const note2El = mainWindow.locator(`[data-session-id="${ids.id2}"]`)
    await expect(note2El).not.toHaveClass(/focus-mode-dimmed/, { timeout: 3000 })

    // note3 (not connected) should be dimmed
    const note3El = mainWindow.locator(`[data-session-id="${ids.id3}"]`)
    await expect(note3El).toHaveClass(/focus-mode-dimmed/, { timeout: 3000 })
  })

  test('clicking a dimmed element shifts focus to it', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ids = await setupFocusModeScene(mainWindow)

    // Enable focus mode
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.focusModeStore.getState().toggle()
    })

    // note3 should be dimmed
    const note3El = mainWindow.locator(`[data-session-id="${ids.id3}"]`)
    await expect(note3El).toHaveClass(/focus-mode-dimmed/, { timeout: 3000 })

    // Click note3 to shift focus
    await note3El.click({ force: true })

    // After clicking, note3 becomes focused, so it should no longer be dimmed
    await expect(note3El).not.toHaveClass(/focus-mode-dimmed/, { timeout: 3000 })

    // note1 and note2 are not connected to note3, so they should now be dimmed
    const note1El = mainWindow.locator(`[data-session-id="${ids.id1}"]`)
    const note2El = mainWindow.locator(`[data-session-id="${ids.id2}"]`)
    await expect(note1El).toHaveClass(/focus-mode-dimmed/, { timeout: 3000 })
    await expect(note2El).toHaveClass(/focus-mode-dimmed/, { timeout: 3000 })
  })

  test('keyboard shortcut Cmd+Shift+. toggles focus mode', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ids = await setupFocusModeScene(mainWindow)

    // Focus mode should be off
    const enabledBefore = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      return stores.focusModeStore.getState().enabled
    })
    expect(enabledBefore).toBe(false)

    // Press Cmd+Shift+. (toggleFocusMode shortcut)
    await pressShortcut(mainWindow, '.', { shift: true })

    // Focus mode should now be on
    const enabledAfter = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      return stores.focusModeStore.getState().enabled
    })
    expect(enabledAfter).toBe(true)

    // note3 should be dimmed
    const note3El = mainWindow.locator(`[data-session-id="${ids.id3}"]`)
    await expect(note3El).toHaveClass(/focus-mode-dimmed/, { timeout: 3000 })

    // Press shortcut again to toggle off
    await pressShortcut(mainWindow, '.', { shift: true })

    const enabledOff = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      return stores.focusModeStore.getState().enabled
    })
    expect(enabledOff).toBe(false)

    // No elements should be dimmed
    const dimmedCount = await mainWindow.locator('.focus-mode-dimmed').count()
    expect(dimmedCount).toBe(0)
  })

  test('connector arrows dim for non-active connections', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ids = await setupFocusModeScene(mainWindow)

    // Add a second connector: note2 → note3
    await mainWindow.evaluate(([id2, id3]) => {
      const stores = (window as any).__SMOKE_STORES__
      stores.connectorStore.getState().addConnector(id2, id3, {
        color: '#00ff00',
      })
    }, [ids.id2, ids.id3])

    // Enable focus mode (note1 is focused, connected to note2)
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.focusModeStore.getState().toggle()
    })

    // The red connector (note1→note2) involves the focused element — should be full opacity
    const activeConnector = mainWindow.locator('svg g[opacity="1"] path[stroke="#ff0000"]')
    await expect(activeConnector).toBeAttached({ timeout: 3000 })

    // The green connector (note2→note3) — note3 is not in active set, so connector is dimmed
    const dimmedConnector = mainWindow.locator('svg g[opacity="0.15"] path[stroke="#00ff00"]')
    await expect(dimmedConnector).toBeAttached({ timeout: 3000 })
  })
})
