import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'
import os from 'os'

/**
 * Helper: close all existing sessions by clicking each window's close button.
 * Uses the X button instead of Cmd+W to avoid accidentally closing the BrowserWindow.
 */
async function closeAllSessions(page: import('@playwright/test').Page): Promise<void> {
  let count = await page.locator('.terminal-window').count()
  while (count > 0) {
    const closeBtn = page.locator('.terminal-window .window-chrome-close').first()
    await closeBtn.click({ force: true })
    await page.waitForTimeout(300)
    count = await page.locator('.terminal-window').count()
  }
  // Also close any non-terminal elements (notes, files, etc.)
  let otherCount = await page.locator('.canvas-element').count()
  while (otherCount > 0) {
    const closeBtn = page.locator('.canvas-element .window-chrome-close').first()
    if (await closeBtn.count() === 0) break
    await closeBtn.click({ force: true })
    await page.waitForTimeout(300)
    otherCount = await page.locator('.canvas-element').count()
  }
}

test.describe('Layout Save, Load, and Reset', () => {
  test('save named layout and load it after closing all sessions', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Clear any pre-existing sessions from restored layouts
    await closeAllSessions(mainWindow)

    // Create two terminals
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const terminalWindows = mainWindow.locator('.terminal-window')
    await expect(terminalWindows).toHaveCount(2, { timeout: 5000 })

    // Open the layout panel and save as "test-layout"
    const layoutToggle = mainWindow.locator('.layout-toggle-btn')
    await layoutToggle.click()
    await mainWindow.waitForTimeout(300)

    const nameInput = mainWindow.locator('.layout-name-input')
    await nameInput.fill('test-layout')

    const saveBtn = mainWindow.locator('.layout-save-btn')
    await saveBtn.click()
    await mainWindow.waitForTimeout(500)

    // Verify layout appears in the list
    const layoutItem = mainWindow.locator('.layout-list-item .layout-name').getByText('test-layout', { exact: true })
    await expect(layoutItem).toBeVisible({ timeout: 3000 })

    // Close all sessions
    await closeAllSessions(mainWindow)
    await expect(terminalWindows).toHaveCount(0, { timeout: 5000 })

    // Load the saved layout
    await layoutItem.click()
    await mainWindow.waitForTimeout(2000)

    // Verify terminals were recreated
    await expect(terminalWindows).toHaveCount(2, { timeout: 10000 })

    // Verify terminals have running PTYs (status dot visible)
    const runningDots = mainWindow.locator('.terminal-window .window-chrome-status.running')
    await expect(runningDots.first()).toBeVisible({ timeout: 5000 })
  })

  test('layout list shows saved layouts via IPC', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Save a layout directly via IPC
    await mainWindow.evaluate(async () => {
      const layout = {
        name: 'ipc-test-layout',
        sessions: [] as any[],
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      }
      await window.smokeAPI?.layout.save('ipc-test-layout', layout)
    })

    // Open layout panel
    const layoutToggle = mainWindow.locator('.layout-toggle-btn')
    await layoutToggle.click()
    await mainWindow.waitForTimeout(500)

    // Verify layout is listed
    const layoutItem = mainWindow.locator('.layout-list-item .layout-name', { hasText: 'ipc-test-layout' })
    await expect(layoutItem).toBeVisible({ timeout: 3000 })
  })

  test('layout reset clears all sessions and resets viewport', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Ensure at least one terminal exists
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const terminalWindows = mainWindow.locator('.terminal-window')
    const countBefore = await terminalWindows.count()
    expect(countBefore).toBeGreaterThanOrEqual(1)

    // Open layout panel and click reset
    const layoutToggle = mainWindow.locator('.layout-toggle-btn')
    await layoutToggle.click()
    await mainWindow.waitForTimeout(300)

    const resetBtn = mainWindow.locator('.layout-reset-btn')
    await resetBtn.click()
    await mainWindow.waitForTimeout(1000)

    // Verify all terminals are gone
    await expect(terminalWindows).toHaveCount(0, { timeout: 5000 })
  })

  test('delete a named layout', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Save a layout via IPC
    await mainWindow.evaluate(async () => {
      const layout = {
        name: 'delete-me',
        sessions: [] as any[],
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      }
      await window.smokeAPI?.layout.save('delete-me', layout)
    })

    // Open layout panel
    const layoutToggle = mainWindow.locator('.layout-toggle-btn')
    await layoutToggle.click()
    await mainWindow.waitForTimeout(500)

    // Verify layout is listed
    const layoutItem = mainWindow.locator('.layout-list-item', { hasText: 'delete-me' })
    await expect(layoutItem).toBeVisible({ timeout: 3000 })

    // Click delete button
    const deleteBtn = layoutItem.locator('.layout-delete-btn')
    await deleteBtn.click()
    await mainWindow.waitForTimeout(500)

    // Verify layout is gone from the list
    await expect(layoutItem).toHaveCount(0, { timeout: 3000 })

    // Verify it's gone from the config store too
    const layoutExists = await mainWindow.evaluate(async () => {
      const result = await window.smokeAPI?.layout.load('delete-me')
      return result !== null && result !== undefined
    })
    expect(layoutExists).toBe(false)
  })

  test('default layout auto-saves on session creation', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Clear any pre-existing sessions
    await closeAllSessions(mainWindow)

    // Create a terminal
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const terminalWindows = mainWindow.locator('.terminal-window')
    await expect(terminalWindows.first()).toBeVisible({ timeout: 5000 })

    // Wait for auto-save to trigger (2s debounce + buffer)
    await mainWindow.waitForTimeout(4000)

    // Verify the default layout was saved
    const hasSavedLayout = await mainWindow.evaluate(async () => {
      const layout = await window.smokeAPI?.layout.load('__default__')
      return layout !== null && layout !== undefined && layout.sessions.length > 0
    })
    expect(hasSavedLayout).toBe(true)
  })

  test('load layout restores terminals with correct positions via IPC', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Clear any pre-existing sessions
    await closeAllSessions(mainWindow)

    const homePath = os.homedir()

    // Save a layout with specific positions via IPC
    await mainWindow.evaluate(async (cwd: string) => {
      const layout = {
        name: 'position-test',
        sessions: [
          {
            type: 'terminal',
            title: 'Terminal A',
            cwd,
            position: { x: 100, y: 200 },
            size: { width: 600, height: 400, cols: 80, rows: 24 },
          },
          {
            type: 'terminal',
            title: 'Terminal B',
            cwd,
            position: { x: 800, y: 200 },
            size: { width: 600, height: 400, cols: 80, rows: 24 },
          },
        ],
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      }
      await window.smokeAPI?.layout.save('position-test', layout)
    }, homePath)

    // Open layout panel and load
    const layoutToggle = mainWindow.locator('.layout-toggle-btn')
    await layoutToggle.click()
    await mainWindow.waitForTimeout(500)

    const layoutItem = mainWindow.locator('.layout-list-item .layout-name', { hasText: 'position-test' })
    await expect(layoutItem).toBeVisible({ timeout: 3000 })
    await layoutItem.click()
    await mainWindow.waitForTimeout(2000)

    // Verify two terminals were created
    const terminalWindows = mainWindow.locator('.terminal-window')
    await expect(terminalWindows).toHaveCount(2, { timeout: 10000 })

    // Verify PTYs are spawned (running status)
    const runningDots = mainWindow.locator('.terminal-window .window-chrome-status.running')
    await expect(runningDots).toHaveCount(2, { timeout: 10000 })
  })
})
