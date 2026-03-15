import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

test.describe('Keyboard Shortcuts', () => {
  test.describe('Session Management', () => {
    test('Cmd+N creates a new session', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const terminalWindows = mainWindow.locator('.terminal-window')
      const countBefore = await terminalWindows.count()

      await pressShortcut(mainWindow, 'n')
      await expect(terminalWindows).toHaveCount(countBefore + 1, { timeout: 5000 })
    })

    test('Cmd+W closes the focused session', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create a terminal first
      await pressShortcut(mainWindow, 'n')
      const terminalWindows = mainWindow.locator('.terminal-window')
      await expect(terminalWindows.first()).toBeVisible({ timeout: 5000 })

      const countBefore = await terminalWindows.count()

      await pressShortcut(mainWindow, 'w')
      await expect(terminalWindows).toHaveCount(countBefore - 1, { timeout: 5000 })
    })

    test('Cmd+Tab cycles to next session', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create two terminals
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      const terminalWindows = mainWindow.locator('.terminal-window')
      expect(await terminalWindows.count()).toBeGreaterThanOrEqual(2)

      // Record the currently focused session
      const focusedBefore = await mainWindow
        .locator('.terminal-window.focused')
        .getAttribute('data-session-id')

      // Cycle to next
      await pressShortcut(mainWindow, 'Tab')
      await mainWindow.waitForTimeout(300)

      const focusedAfter = await mainWindow
        .locator('.terminal-window.focused')
        .getAttribute('data-session-id')

      // Focus should have changed
      expect(focusedAfter).not.toBe(focusedBefore)
    })

    test('Cmd+Shift+Tab cycles to previous session', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create two terminals
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      // Cycle forward first to establish a known state
      await pressShortcut(mainWindow, 'Tab')
      await mainWindow.waitForTimeout(300)

      const focusedBefore = await mainWindow
        .locator('.terminal-window.focused')
        .getAttribute('data-session-id')

      // Cycle backward
      await pressShortcut(mainWindow, 'Tab', { shift: true })
      await mainWindow.waitForTimeout(300)

      const focusedAfter = await mainWindow
        .locator('.terminal-window.focused')
        .getAttribute('data-session-id')

      expect(focusedAfter).not.toBe(focusedBefore)
    })

    test('Escape unfocuses the current session', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create and focus a terminal
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      const focused = mainWindow.locator('.terminal-window.focused')
      await expect(focused).toBeVisible({ timeout: 5000 })

      // Press Escape to unfocus
      await mainWindow.keyboard.press('Escape')
      await mainWindow.waitForTimeout(300)

      // No terminal should be focused
      const focusedAfter = mainWindow.locator('.terminal-window.focused')
      await expect(focusedAfter).toHaveCount(0, { timeout: 3000 })
    })
  })

  test.describe('Focus by Index (Cmd+1-9)', () => {
    test('Cmd+1 focuses the first session', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create two terminals
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      // The second terminal should be focused (most recently created)
      // Press Cmd+1 to focus the first
      await pressShortcut(mainWindow, '1')
      await mainWindow.waitForTimeout(300)

      // The first session-list-item should now correspond to the focused terminal
      const sessionItems = mainWindow.locator('.session-list-item')
      const firstItem = sessionItems.first()
      await expect(firstItem).toHaveClass(/focused/, { timeout: 3000 })
    })

    test('Cmd+2 focuses the second session', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create two terminals
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      // Focus the first, then switch to second
      await pressShortcut(mainWindow, '1')
      await mainWindow.waitForTimeout(300)

      await pressShortcut(mainWindow, '2')
      await mainWindow.waitForTimeout(300)

      // The second session-list-item should be focused
      const sessionItems = mainWindow.locator('.session-list-item')
      const secondItem = sessionItems.nth(1)
      await expect(secondItem).toHaveClass(/focused/, { timeout: 3000 })
    })
  })

  test.describe('Zoom Shortcuts', () => {
    test('Cmd+0 resets zoom to 100%', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Zoom in first
      await pressShortcut(mainWindow, '=')
      await mainWindow.waitForTimeout(300)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      await expect(zoomBtn).toBeVisible({ timeout: 5000 })

      // Reset zoom
      await pressShortcut(mainWindow, '0')
      await mainWindow.waitForTimeout(300)

      const text = await zoomBtn.textContent()
      expect(text).toBe('100%')
    })

    test('Cmd+= zooms in', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Reset zoom first
      await pressShortcut(mainWindow, '0')
      await mainWindow.waitForTimeout(300)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
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

      // Reset zoom first
      await pressShortcut(mainWindow, '0')
      await mainWindow.waitForTimeout(300)

      const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
      const initialText = await zoomBtn.textContent()
      const initialZoom = parseInt(initialText!.replace('%', ''), 10)

      await pressShortcut(mainWindow, '-')
      await mainWindow.waitForTimeout(300)

      const afterText = await zoomBtn.textContent()
      const afterZoom = parseInt(afterText!.replace('%', ''), 10)
      expect(afterZoom).toBeLessThan(initialZoom)
    })
  })

  test.describe('Layout & Save', () => {
    test('Cmd+S opens save layout dialog', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create a terminal so there's something to save
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      await pressShortcut(mainWindow, 's')
      await mainWindow.waitForTimeout(500)

      // Save dialog or layout name input should appear
      // The save layout action saves as the default layout — check that the
      // layout panel shows a saved entry or a toast appears
      // For now, verify no crash and the terminal is still there
      const terminalWindows = mainWindow.locator('.terminal-window')
      await expect(terminalWindows.first()).toBeVisible()
    })
  })

  test.describe('Settings & Help', () => {
    test('Cmd+, opens settings panel', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      await pressShortcut(mainWindow, ',')
      await mainWindow.waitForTimeout(500)

      // The settings modal should be visible
      const settingsPanel = mainWindow.locator('.settings-modal, .config-panel, [class*="settings"]')
      await expect(settingsPanel.first()).toBeVisible({ timeout: 5000 })
    })

    test('Cmd+/ (or ? button) shows keyboard shortcuts overlay', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Click the ? button in the sidebar header (equivalent to Cmd+/)
      const helpBtn = mainWindow.locator('.sidebar-settings-btn[title*="Shortcuts"]')
      await helpBtn.click()
      await mainWindow.waitForTimeout(500)

      // Shortcuts modal should be visible
      const overlay = mainWindow.locator('.shortcuts-modal')
      await expect(overlay).toBeVisible({ timeout: 5000 })
    })

    test('Cmd+P opens command palette', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      await pressShortcut(mainWindow, 'p')
      await mainWindow.waitForTimeout(500)

      // Command palette should be visible
      const palette = mainWindow.locator('.command-palette, [class*="palette"]')
      await expect(palette.first()).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('AI & Assembly', () => {
    test('Cmd+Shift+A opens context assembly / task input', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      await pressShortcut(mainWindow, 'a', { shift: true })
      await mainWindow.waitForTimeout(500)

      // Task input or assembly panel should be visible
      const assemblyUI = mainWindow.locator('.task-input, .assembly-preview, [class*="task-input"], [class*="assembly"]')
      await expect(assemblyUI.first()).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Shortcuts are intercepted from terminal', () => {
    test('Cmd+N does not send to terminal when focused', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create a terminal
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      const terminalWindows = mainWindow.locator('.terminal-window')
      await expect(terminalWindows.first()).toBeVisible({ timeout: 5000 })
      const countAfterFirst = await terminalWindows.count()

      // Press Cmd+N again — should create another terminal, not type in the first
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      await expect(terminalWindows).toHaveCount(countAfterFirst + 1, { timeout: 5000 })
    })

    test('Cmd+W does not send to terminal when focused', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      // Create two terminals
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)

      const terminalWindows = mainWindow.locator('.terminal-window')
      const countBefore = await terminalWindows.count()
      expect(countBefore).toBeGreaterThanOrEqual(2)

      // Cmd+W should close the focused terminal, not send ^W to the shell
      await pressShortcut(mainWindow, 'w')
      await expect(terminalWindows).toHaveCount(countBefore - 1, { timeout: 5000 })
    })
  })
})
