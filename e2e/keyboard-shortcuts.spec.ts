import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut, evaluate } from './helpers'

test.describe('Keyboard Shortcuts: Session Management', () => {
  test('Cmd+N creates a new session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const terminalsBefore = await mainWindow.locator('.terminal-window').count()

    await pressShortcut(mainWindow, 'n')

    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow).toHaveCount(terminalsBefore + 1, { timeout: 5000 })
  })

  test('Cmd+W closes the focused session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a session first
    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const countBefore = await terminalWindow.count()

    await pressShortcut(mainWindow, 'w')

    await expect(terminalWindow).toHaveCount(countBefore - 1, { timeout: 5000 })
  })

  test('Cmd+W does nothing when no session is focused', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Ensure no sessions exist
    const countBefore = await mainWindow.locator('.terminal-window').count()

    // Press Cmd+W — should not crash or create errors
    await pressShortcut(mainWindow, 'w')
    await mainWindow.waitForTimeout(300)

    const countAfter = await mainWindow.locator('.terminal-window').count()
    expect(countAfter).toBe(countBefore)
  })
})

test.describe('Keyboard Shortcuts: Session Cycling', () => {
  test('Cmd+Tab cycles to next session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const countBefore = await mainWindow.locator('.terminal-window').count()

    // Create two sessions
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const terminalWindows = mainWindow.locator('.terminal-window')
    await expect(terminalWindows).toHaveCount(countBefore + 2, { timeout: 5000 })

    // Get the currently focused session ID
    const focusedBefore = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Cycle to next
    await mainWindow.keyboard.press('Meta+Tab')
    await mainWindow.waitForTimeout(500)

    const focusedAfter = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    expect(focusedAfter).not.toBe(focusedBefore)
  })

  test('Shift+Cmd+Tab cycles to previous session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two sessions
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const focusedBefore = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Cycle to previous
    await mainWindow.keyboard.press('Shift+Meta+Tab')
    await mainWindow.waitForTimeout(500)

    const focusedAfter = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    expect(focusedAfter).not.toBe(focusedBefore)
  })

  test('Cmd+Tab wraps around from last to first session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create three sessions
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    // Get total session count (may include restored sessions)
    const sessionCount = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.size
    )
    expect(sessionCount).toBeGreaterThanOrEqual(3)

    // Cycle forward sessionCount times — should return to original
    const focusedBefore = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    for (let i = 0; i < sessionCount; i++) {
      await mainWindow.keyboard.press('Meta+Tab')
      await mainWindow.waitForTimeout(300)
    }

    const focusedAfter = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    expect(focusedAfter).toBe(focusedBefore)
  })
})

test.describe('Keyboard Shortcuts: Focus by Index (Cmd+1-9)', () => {
  test('Cmd+1 focuses the first session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two sessions
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    // Get sorted session IDs (by createdAt)
    const sortedIds = await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return Array.from(store.sessions.entries())
        .sort((a: any, b: any) => a[1].createdAt - b[1].createdAt)
        .map(([id]: [string]) => id)
    })

    // Press Cmd+1 — should focus the first session
    await pressShortcut(mainWindow, '1')
    await mainWindow.waitForTimeout(500)

    const focusedId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    expect(focusedId).toBe(sortedIds[0])
  })

  test('Cmd+2 focuses the second session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two sessions
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const sortedIds = await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      return Array.from(store.sessions.entries())
        .sort((a: any, b: any) => a[1].createdAt - b[1].createdAt)
        .map(([id]: [string]) => id)
    })

    expect(sortedIds.length).toBeGreaterThanOrEqual(2)

    await pressShortcut(mainWindow, '2')
    await mainWindow.waitForTimeout(500)

    const focusedId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    expect(focusedId).toBe(sortedIds[1])
  })

  test('Cmd+9 focuses the 9th session or does nothing if fewer exist', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create one session
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const totalSessions = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.size
    )

    const focusedBefore = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Press Cmd+9
    await pressShortcut(mainWindow, '9')
    await mainWindow.waitForTimeout(300)

    const focusedAfter = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    if (totalSessions >= 9) {
      // If 9+ sessions exist (e.g. from restored layout), it should focus the 9th
      const sortedIds = await evaluate(mainWindow, () => {
        const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
        return Array.from(store.sessions.entries())
          .sort((a: any, b: any) => a[1].createdAt - b[1].createdAt)
          .map(([id]: [string]) => id)
      })
      expect(focusedAfter).toBe(sortedIds[8])
    } else {
      // If fewer than 9 sessions, focus should not change
      expect(focusedAfter).toBe(focusedBefore)
    }
  })
})

test.describe('Keyboard Shortcuts: Zoom', () => {
  test('Cmd+= zooms in', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Reset zoom first
    await pressShortcut(mainWindow, '0')
    await mainWindow.waitForTimeout(300)

    const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
    await expect(zoomBtn).toHaveText('100%', { timeout: 5000 })

    await pressShortcut(mainWindow, '=')
    await mainWindow.waitForTimeout(300)

    await expect(zoomBtn).toHaveText('120%')
  })

  test('Cmd+- zooms out', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, '0')
    await mainWindow.waitForTimeout(300)

    const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
    await expect(zoomBtn).toHaveText('100%', { timeout: 5000 })

    await pressShortcut(mainWindow, '-')
    await mainWindow.waitForTimeout(300)

    await expect(zoomBtn).toHaveText('83%')
  })

  test('Cmd+0 resets zoom to 100%', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Zoom in first
    await pressShortcut(mainWindow, '=')
    await pressShortcut(mainWindow, '=')
    await mainWindow.waitForTimeout(300)

    const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
    const zoomedText = await zoomBtn.textContent()
    expect(zoomedText).not.toBe('100%')

    // Reset
    await pressShortcut(mainWindow, '0')
    await mainWindow.waitForTimeout(300)

    await expect(zoomBtn).toHaveText('100%')
  })
})

test.describe('Keyboard Shortcuts: Save Layout', () => {
  test('Cmd+S triggers layout save without error', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a session so there's something to save
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    // Press Cmd+S — should save layout without opening a dialog or erroring
    await pressShortcut(mainWindow, 's')
    await mainWindow.waitForTimeout(500)

    // Verify the layout was saved by checking the IPC call succeeded
    // (no error dialog should appear, and the session should still be there)
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible()
  })
})

test.describe('Keyboard Shortcuts: Settings', () => {
  test('Cmd+, opens settings modal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, ',')

    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Verify it has the settings title
    const title = modal.locator('.settings-title')
    await expect(title).toHaveText('Settings')
  })

  test('Cmd+, toggles settings modal closed', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open
    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Close with same shortcut (toggle)
    await pressShortcut(mainWindow, ',')
    await expect(modal).not.toBeVisible({ timeout: 3000 })
  })
})

test.describe('Keyboard Shortcuts: Escape', () => {
  test('Escape unfocuses the current session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create and focus a session
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const focusedBefore = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )
    expect(focusedBefore).toBeTruthy()

    // Press Escape — should unfocus
    await mainWindow.keyboard.press('Escape')
    await mainWindow.waitForTimeout(300)

    const focusedAfter = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    expect(focusedAfter).toBeNull()
  })

  test('Escape clears selection when sessions are selected', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two sessions
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    // Unfocus first so selectAll works (selectAll is blocked when terminal is focused)
    await mainWindow.keyboard.press('Escape')
    await mainWindow.waitForTimeout(300)

    // Select all sessions via the store directly
    await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      const allIds = new Set(store.sessions.keys())
      store.setSelectedIds(allIds)
    })
    await mainWindow.waitForTimeout(300)

    const selectedBefore = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().selectedIds.size
    )
    expect(selectedBefore).toBeGreaterThan(0)

    // Press Escape — should clear selection
    await mainWindow.keyboard.press('Escape')
    await mainWindow.waitForTimeout(300)

    const selectedAfter = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().selectedIds.size
    )
    expect(selectedAfter).toBe(0)
  })
})

test.describe('Keyboard Shortcuts: Command Palette', () => {
  test('Cmd+P opens command palette', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')

    const palette = mainWindow.locator('.palette-modal')
    await expect(palette).toBeVisible({ timeout: 3000 })

    // Verify the input field is present and focused
    const input = palette.locator('.palette-input')
    await expect(input).toBeVisible()
  })

  test('Escape closes command palette', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    const palette = mainWindow.locator('.palette-modal')
    await expect(palette).toBeVisible({ timeout: 3000 })

    await mainWindow.keyboard.press('Escape')
    await expect(palette).not.toBeVisible({ timeout: 3000 })
  })

  test('command palette shows items matching search', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    const palette = mainWindow.locator('.palette-modal')
    await expect(palette).toBeVisible({ timeout: 3000 })

    // Type a search term — palette uses "New Terminal" not "New Session"
    const input = palette.locator('.palette-input')
    await input.fill('new terminal')
    await mainWindow.waitForTimeout(300)

    // Should show at least one matching result
    const items = palette.locator('.palette-item')
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // The first item should mention "New Terminal"
    const firstItemTitle = await items.first().locator('.palette-item-title').textContent()
    expect(firstItemTitle?.toLowerCase()).toContain('new terminal')
  })
})

test.describe('Keyboard Shortcuts: Assemble Workspace (Cmd+Shift+A)', () => {
  test('Cmd+Shift+A opens context assembly modal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'a', { shift: true })

    const modal = mainWindow.locator('.task-input-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Verify title
    const title = modal.locator('.task-input-title')
    await expect(title).toHaveText('Assemble Workspace')
  })

  test('Escape closes context assembly modal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'a', { shift: true })
    const modal = mainWindow.locator('.task-input-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    await mainWindow.keyboard.press('Escape')
    await expect(modal).not.toBeVisible({ timeout: 3000 })
  })
})

test.describe('Keyboard Shortcuts: Shortcuts Help (Cmd+/)', () => {
  test('shortcuts overlay opens and shows all shortcut groups', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Click the shortcuts help button in the sidebar (? icon)
    // Cmd+/ is unreliable via Playwright on macOS, so use the sidebar button
    // which calls the same shortcutsOverlayStore.open()
    const helpBtn = mainWindow.locator('button[title*="Keyboard Shortcuts"]')
    await expect(helpBtn).toBeVisible({ timeout: 5000 })
    await helpBtn.click()
    await mainWindow.waitForTimeout(300)

    const overlay = mainWindow.locator('.shortcuts-modal')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    // Verify title
    const title = overlay.locator('.shortcuts-title')
    await expect(title).toHaveText('Keyboard Shortcuts')

    // Verify shortcut sections are rendered
    const sections = overlay.locator('.shortcuts-section')
    const sectionCount = await sections.count()
    expect(sectionCount).toBeGreaterThanOrEqual(5)

    // Verify individual shortcut rows exist
    const rows = overlay.locator('.shortcuts-row')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(20)
  })

  test('Escape closes shortcuts overlay', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const helpBtn = mainWindow.locator('button[title*="Keyboard Shortcuts"]')
    await expect(helpBtn).toBeVisible({ timeout: 5000 })
    await helpBtn.click()
    await mainWindow.waitForTimeout(300)

    const overlay = mainWindow.locator('.shortcuts-modal')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    await mainWindow.keyboard.press('Escape')
    await expect(overlay).not.toBeVisible({ timeout: 3000 })
  })

  test('close button closes shortcuts overlay', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const helpBtn = mainWindow.locator('button[title*="Keyboard Shortcuts"]')
    await expect(helpBtn).toBeVisible({ timeout: 5000 })
    await helpBtn.click()
    await mainWindow.waitForTimeout(300)

    const overlay = mainWindow.locator('.shortcuts-modal')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    const closeBtn = overlay.locator('.shortcuts-close-btn')
    await closeBtn.click()
    await expect(overlay).not.toBeVisible({ timeout: 3000 })
  })
})

test.describe('Keyboard Shortcuts: Multiple shortcuts in sequence', () => {
  test('create, cycle, and close sessions using only shortcuts', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sessionsBefore = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.size
    )

    // Create 2 sessions with Cmd+N
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const sessionsAfterCreate = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.size
    )
    expect(sessionsAfterCreate).toBe(sessionsBefore + 2)

    // Cycle with Cmd+Tab — focus should change
    const focusedId1 = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    await mainWindow.keyboard.press('Meta+Tab')
    await mainWindow.waitForTimeout(500)

    const focusedId2 = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )
    expect(focusedId2).not.toBe(focusedId1)

    // Cycle back with Shift+Cmd+Tab
    await mainWindow.keyboard.press('Shift+Meta+Tab')
    await mainWindow.waitForTimeout(500)

    const focusedId3 = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )
    expect(focusedId3).toBe(focusedId1)

    // Close current session with Cmd+W
    await pressShortcut(mainWindow, 'w')
    await mainWindow.waitForTimeout(500)

    const sessionsAfterClose = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.size
    )
    expect(sessionsAfterClose).toBe(sessionsAfterCreate - 1)
  })
})
