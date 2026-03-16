import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

test.describe('Terminal Session Lifecycle', () => {
  test('create terminal via double-click on canvas', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const canvas = mainWindow.locator('.canvas-root')
    await canvas.dblclick({ position: { x: 400, y: 300 } })

    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const statusDot = terminalWindow.first().locator('.window-chrome-status.running')
    await expect(statusDot).toBeVisible({ timeout: 5000 })
  })

  test('create terminal via Cmd+N', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')

    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })
  })

  test('create terminal via sidebar button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open the create menu and click "Terminal"
    const createBtn = mainWindow.locator('.sidebar-create-btn')
    await createBtn.click()
    const terminalItem = mainWindow.locator('.create-menu-item', { hasText: 'Terminal' })
    await terminalItem.click()

    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })
  })

  test('terminal renders with shell prompt', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const xtermEl = terminalWindow.first().locator('.xterm')
    await expect(xtermEl).toBeVisible({ timeout: 5000 })

    const xtermScreen = terminalWindow.first().locator('.xterm-screen')
    await expect(xtermScreen).toBeVisible({ timeout: 5000 })
  })

  test('type command and verify output', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    // Wait for shell to initialize
    await mainWindow.waitForTimeout(1500)

    // Get the session ID of the terminal
    const sessionId = await terminalWindow.first().getAttribute('data-session-id')
    expect(sessionId).toBeTruthy()

    // Use a unique marker file to verify command execution
    const markerFile = `/tmp/smoke-e2e-${Date.now()}`

    // Write a command to create a marker file via the PTY
    await mainWindow.evaluate(([id, file]) => {
      window.smokeAPI.pty.write(id!, `echo E2E_MARKER > ${file}\n`)
    }, [sessionId, markerFile] as const)

    // Wait for the command to execute
    await mainWindow.waitForTimeout(2000)

    // Verify the marker file was created (proving the PTY executed the command)
    const fs = await import('fs')
    const exists = fs.existsSync(markerFile)
    expect(exists).toBe(true)

    // Verify file content
    const content = fs.readFileSync(markerFile, 'utf-8').trim()
    expect(content).toBe('E2E_MARKER')

    // Cleanup
    fs.unlinkSync(markerFile)
  })

  test('close terminal via Cmd+W', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const countBefore = await terminalWindow.count()
    expect(countBefore).toBeGreaterThanOrEqual(1)

    await pressShortcut(mainWindow, 'w')

    await expect(terminalWindow).toHaveCount(countBefore - 1, { timeout: 5000 })
  })

  test('close terminal via window chrome X button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const countBefore = await terminalWindow.count()

    const closeBtn = terminalWindow.first().locator('.window-chrome-close')
    await closeBtn.click({ force: true })

    await expect(terminalWindow).toHaveCount(countBefore - 1, { timeout: 5000 })
  })

  test('session appears in sidebar list', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const sessionItems = mainWindow.locator('.session-list-item')
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 })

    const runningDot = sessionItems.first().locator('.status-dot.running')
    await expect(runningDot).toBeVisible()
  })

  test('multiple terminals with focus switching', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create first terminal
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    // Create second terminal
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const terminalWindows = mainWindow.locator('.terminal-window')
    const count = await terminalWindows.count()
    expect(count).toBeGreaterThanOrEqual(2)

    // The most recently created terminal should be focused
    const focusedWindow = mainWindow.locator('.terminal-window.focused')
    await expect(focusedWindow).toBeVisible()

    // Get the first terminal's session ID
    const firstWindow = terminalWindows.first()
    const firstSessionId = await firstWindow.getAttribute('data-session-id')

    // Click its sidebar item to switch focus (sidebar is not overlapped by minimap)
    const sessionItems = mainWindow.locator('.session-list-item')
    // Find the sidebar item that corresponds to the first terminal
    // Session items are listed in the same order as terminals
    await sessionItems.first().click()
    await mainWindow.waitForTimeout(300)

    // The first window should now be focused
    const nowFocused = mainWindow.locator('.terminal-window.focused')
    const focusedSessionId = await nowFocused.getAttribute('data-session-id')
    expect(focusedSessionId).toBe(firstSessionId)
  })

  test('session removed from sidebar on close', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    const sessionItems = mainWindow.locator('.session-list-item')
    const itemCountBefore = await sessionItems.count()
    expect(itemCountBefore).toBeGreaterThanOrEqual(1)

    await pressShortcut(mainWindow, 'w')

    await expect(sessionItems).toHaveCount(itemCountBefore - 1, { timeout: 5000 })
  })
})
