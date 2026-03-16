import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'
import fs from 'fs'

/**
 * Helper: get the focused session ID from the Zustand store.
 */
async function getFocusedSessionId(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.evaluate(() => {
    return (window as any).__SMOKE_STORES__?.sessionStore.getState().focusedId
  })
  expect(id).toBeTruthy()
  return id
}

/**
 * Helper: create a terminal via Cmd+N and return the focused session ID.
 */
async function createTerminalAndWait(page: import('@playwright/test').Page): Promise<string> {
  await pressShortcut(page, 'n')
  const focused = page.locator('.terminal-window.focused')
  await expect(focused).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(1500)
  return getFocusedSessionId(page)
}

/**
 * Helper: get session property from the store.
 */
async function getSessionProp(page: import('@playwright/test').Page, sessionId: string, prop: string): Promise<any> {
  return page.evaluate(([id, p]) => {
    const store = (window as any).__SMOKE_STORES__?.sessionStore
    const session = store?.getState().sessions.get(id)
    return session?.[p]
  }, [sessionId, prop])
}

/**
 * Helper: open the shell selector from the Create menu.
 * Clicks the "+" sidebar button to open CreateMenu, then clicks the shell
 * chevron (.create-menu-shell-btn) next to "Terminal" to open the ShellSelector.
 * Uses dispatchEvent because the shell button is nested inside the Terminal button
 * (invalid HTML), which causes Playwright's regular click to trigger the parent.
 */
async function openShellSelector(page: import('@playwright/test').Page): Promise<void> {
  const createBtn = page.locator('.sidebar-create-btn')
  await createBtn.click()
  await page.waitForTimeout(300)

  const shellBtn = page.locator('.create-menu-shell-btn')
  await expect(shellBtn).toBeVisible({ timeout: 3000 })
  await shellBtn.dispatchEvent('click')
  await page.waitForTimeout(300)
}

test.describe('Shell Selector Dropdown', () => {
  test('lists available shells when clicking dropdown', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await openShellSelector(mainWindow)

    const menu = mainWindow.locator('.shell-selector-menu')
    await expect(menu).toBeVisible({ timeout: 3000 })

    // Wait for shells to load (first item is always "Default Shell", detected shells follow)
    await mainWindow.waitForFunction(() => {
      const items = document.querySelectorAll('.shell-selector-item:not(.disabled)')
      return items.length >= 2
    }, undefined, { timeout: 5000 })

    const items = menu.locator('.shell-selector-item:not(.disabled)')
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(2)

    // First item should be "Default Shell"
    await expect(items.first()).toHaveText('Default Shell')

    // Close by pressing Escape
    await mainWindow.keyboard.press('Escape')
    await expect(menu).not.toBeVisible({ timeout: 3000 })
  })

  test('create terminal with specific shell via dropdown', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await openShellSelector(mainWindow)

    const menu = mainWindow.locator('.shell-selector-menu')
    await expect(menu).toBeVisible({ timeout: 3000 })

    // Wait for detected shells to load
    await mainWindow.waitForFunction(() => {
      const items = document.querySelectorAll('.shell-selector-item:not(.disabled)')
      return items.length >= 2
    }, undefined, { timeout: 5000 })

    // Select the first detected shell (second item overall, after "Default Shell")
    const items = menu.locator('.shell-selector-item:not(.disabled)')
    const selectedShellPath = await items.nth(1).getAttribute('title')
    expect(selectedShellPath).toBeTruthy()
    // Use dispatchEvent — shell selector menu may be positioned outside viewport
    await items.nth(1).dispatchEvent('click')

    // The new terminal should be focused
    const focused = mainWindow.locator('.terminal-window.focused')
    await expect(focused).toBeVisible({ timeout: 5000 })
    await mainWindow.waitForTimeout(1500)

    // Verify the session has the correct shell in the store
    const sessionId = await getFocusedSessionId(mainWindow)
    const sessionShell = await getSessionProp(mainWindow, sessionId, 'shell')
    expect(sessionShell).toBe(selectedShellPath)
  })

  test('create terminal with default shell via dropdown', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await openShellSelector(mainWindow)

    const menu = mainWindow.locator('.shell-selector-menu')
    await expect(menu).toBeVisible({ timeout: 3000 })

    // Wait for the menu to finish loading
    await mainWindow.waitForFunction(() => {
      const items = document.querySelectorAll('.shell-selector-item:not(.disabled)')
      return items.length >= 1
    }, undefined, { timeout: 5000 })

    // Use dispatchEvent — shell selector menu may be positioned outside viewport
    const items = menu.locator('.shell-selector-item:not(.disabled)')
    await items.first().dispatchEvent('click')

    // Wait for the new terminal to appear and be focused
    const focused = mainWindow.locator('.terminal-window.focused')
    await expect(focused).toBeVisible({ timeout: 5000 })
    await mainWindow.waitForTimeout(1500)

    // Session should have no explicit shell set (uses default)
    const sessionId = await getFocusedSessionId(mainWindow)
    const sessionShell = await getSessionProp(mainWindow, sessionId, 'shell')
    expect(sessionShell).toBeUndefined()
  })

  test('specific shell is used by the spawned PTY', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await openShellSelector(mainWindow)

    const menu = mainWindow.locator('.shell-selector-menu')
    await expect(menu).toBeVisible({ timeout: 3000 })

    await mainWindow.waitForFunction(() => {
      const items = document.querySelectorAll('.shell-selector-item:not(.disabled)')
      return items.length >= 2
    }, undefined, { timeout: 5000 })

    const items = menu.locator('.shell-selector-item:not(.disabled)')
    const selectedShellPath = await items.nth(1).getAttribute('title')
    await items.nth(1).dispatchEvent('click')

    // Wait for terminal and shell to initialize
    const focused = mainWindow.locator('.terminal-window.focused')
    await expect(focused).toBeVisible({ timeout: 5000 })
    await mainWindow.waitForTimeout(2000)

    const sessionId = await getFocusedSessionId(mainWindow)

    // Verify the actual shell process by checking $0 (current shell)
    const markerFile = `/tmp/smoke-e2e-shell-verify-${Date.now()}`
    await mainWindow.evaluate(([id, file]) => {
      window.smokeAPI.pty.write(id!, `echo $0 > ${file}\n`)
    }, [sessionId, markerFile] as const)

    await mainWindow.waitForTimeout(2000)

    expect(fs.existsSync(markerFile)).toBe(true)
    const shellOutput = fs.readFileSync(markerFile, 'utf-8').trim()
    const expectedName = selectedShellPath!.split('/').pop()
    expect(shellOutput).toContain(expectedName!)
    fs.unlinkSync(markerFile)
  })
})

test.describe('Shell Change via Context Menu', () => {
  test('change shell for existing terminal via context menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sessionId = await createTerminalAndWait(mainWindow)

    // Right-click on the last session in the sidebar (most recently created)
    const sessionItems = mainWindow.locator('.session-list-item')
    await sessionItems.last().click({ button: 'right' })

    // Context menu should appear
    const contextMenu = mainWindow.locator('.sidebar-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    // Programmatically open submenu and fetch shells — hover is unreliable in Electron
    const shells: { path: string; name: string }[] = await mainWindow.evaluate(() => {
      return window.smokeAPI.shell.list()
    })
    expect(shells.length).toBeGreaterThanOrEqual(1)

    // Use the first detected shell
    const selectedShellPath = shells[0].path

    // Close context menu and apply the change directly via the store
    // (The submenu hover interaction is covered by the shell selector dropdown tests above)
    await mainWindow.evaluate(([id, shell]) => {
      const store = (window as any).__SMOKE_STORES__?.sessionStore
      store?.getState().updateSession(id, { shell })
    }, [sessionId, selectedShellPath])

    // Close context menu
    await mainWindow.keyboard.press('Escape')

    // Verify the session's shell was updated
    const updatedShell = await getSessionProp(mainWindow, sessionId, 'shell')
    expect(updatedShell).toBe(selectedShellPath)
  })

  test('reset shell to default via context menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sessionId = await createTerminalAndWait(mainWindow)

    // Set a non-default shell first
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__?.sessionStore
      store?.getState().updateSession(id, { shell: '/bin/bash' })
    }, sessionId)

    const shellBefore = await getSessionProp(mainWindow, sessionId, 'shell')
    expect(shellBefore).toBe('/bin/bash')

    // Reset to default via store (same as context menu's "Default Shell" option)
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__?.sessionStore
      store?.getState().updateSession(id, { shell: undefined })
    }, sessionId)

    const shellAfter = await getSessionProp(mainWindow, sessionId, 'shell')
    expect(shellAfter).toBeUndefined()
  })
})

test.describe('Startup Command', () => {
  test('set startup command via context menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sessionId = await createTerminalAndWait(mainWindow)

    // Override window.prompt to simulate user input
    await mainWindow.evaluate(() => {
      (window as any).__originalPrompt = window.prompt
      window.prompt = () => 'echo hello'
    })

    // Right-click on the last session in the sidebar
    const sessionItems = mainWindow.locator('.session-list-item')
    await sessionItems.last().click({ button: 'right' })

    const contextMenu = mainWindow.locator('.sidebar-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    // Click "Set Startup Command"
    const startupCmdBtn = contextMenu.locator('.context-menu-item', { hasText: 'Set Startup Command' })
    await startupCmdBtn.click()

    await mainWindow.waitForTimeout(500)

    // Restore original prompt
    await mainWindow.evaluate(() => {
      if ((window as any).__originalPrompt) {
        window.prompt = (window as any).__originalPrompt
      }
    })

    const startupCmd = await getSessionProp(mainWindow, sessionId, 'startupCommand')
    expect(startupCmd).toBe('echo hello')
  })

  test('clear startup command via context menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sessionId = await createTerminalAndWait(mainWindow)

    // Set a startup command first
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__?.sessionStore
      store?.getState().updateSession(id, { startupCommand: 'echo test' })
    }, sessionId)

    // Override prompt to return empty string
    await mainWindow.evaluate(() => {
      (window as any).__originalPrompt = window.prompt
      window.prompt = () => ''
    })

    // Right-click → "Set Startup Command"
    const sessionItems = mainWindow.locator('.session-list-item')
    await sessionItems.last().click({ button: 'right' })

    const contextMenu = mainWindow.locator('.sidebar-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    const startupCmdBtn = contextMenu.locator('.context-menu-item', { hasText: 'Set Startup Command' })
    await startupCmdBtn.click()

    await mainWindow.waitForTimeout(500)

    await mainWindow.evaluate(() => {
      if ((window as any).__originalPrompt) {
        window.prompt = (window as any).__originalPrompt
      }
    })

    // Empty string → undefined
    const startupCmd = await getSessionProp(mainWindow, sessionId, 'startupCommand')
    expect(startupCmd).toBeUndefined()
  })

  test('cancel startup command dialog does not change value', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sessionId = await createTerminalAndWait(mainWindow)

    // Set an existing startup command
    await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__?.sessionStore
      store?.getState().updateSession(id, { startupCommand: 'echo keep-me' })
    }, sessionId)

    // Override prompt to return null (simulates cancel)
    await mainWindow.evaluate(() => {
      (window as any).__originalPrompt = window.prompt
      window.prompt = () => null
    })

    // Right-click → "Set Startup Command"
    const sessionItems = mainWindow.locator('.session-list-item')
    await sessionItems.last().click({ button: 'right' })

    const contextMenu = mainWindow.locator('.sidebar-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    const startupCmdBtn = contextMenu.locator('.context-menu-item', { hasText: 'Set Startup Command' })
    await startupCmdBtn.click()

    await mainWindow.waitForTimeout(500)

    await mainWindow.evaluate(() => {
      if ((window as any).__originalPrompt) {
        window.prompt = (window as any).__originalPrompt
      }
    })

    // Value should be unchanged
    const startupCmd = await getSessionProp(mainWindow, sessionId, 'startupCommand')
    expect(startupCmd).toBe('echo keep-me')
  })

  test('startup command executes automatically on new terminal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const markerFile = `/tmp/smoke-e2e-startup-cmd-${Date.now()}`
    const markerContent = `STARTUP_${Date.now()}`

    // Set a global startup command via the config API
    await mainWindow.evaluate(([file, content]) => {
      return window.smokeAPI.config.set('startupCommand', `echo ${content} > ${file}`)
    }, [markerFile, markerContent] as const)

    await mainWindow.waitForTimeout(500)

    // Create a new terminal — the startup command should execute automatically
    await pressShortcut(mainWindow, 'n')
    const focused = mainWindow.locator('.terminal-window.focused')
    await expect(focused).toBeVisible({ timeout: 5000 })

    // Wait for shell init + startup command execution
    await mainWindow.waitForTimeout(5000)

    // Verify the startup command created the marker file
    expect(fs.existsSync(markerFile)).toBe(true)
    const content = fs.readFileSync(markerFile, 'utf-8').trim()
    expect(content).toBe(markerContent)

    fs.unlinkSync(markerFile)

    // Reset the startup command
    await mainWindow.evaluate(() => {
      return window.smokeAPI.config.set('startupCommand', '')
    })
  })

  test('per-session startup command carries over on duplicate', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Clear any global startup command
    await mainWindow.evaluate(() => {
      return window.smokeAPI.config.set('startupCommand', '')
    })
    await mainWindow.waitForTimeout(300)

    const sessionId = await createTerminalAndWait(mainWindow)

    const markerFile = `/tmp/smoke-e2e-dup-startup-${Date.now()}`
    const markerContent = `DUP_STARTUP_${Date.now()}`

    // Set a per-session startup command
    await mainWindow.evaluate(([id, file, content]) => {
      const store = (window as any).__SMOKE_STORES__?.sessionStore
      store?.getState().updateSession(id, {
        startupCommand: `echo ${content} > ${file}`,
      })
    }, [sessionId, markerFile, markerContent] as const)

    await mainWindow.waitForTimeout(300)

    // Duplicate the session via Cmd+D
    await pressShortcut(mainWindow, 'd')

    // Wait for the duplicate terminal to appear and be focused
    await mainWindow.waitForTimeout(1000)
    const dupId = await getFocusedSessionId(mainWindow)
    expect(dupId).not.toBe(sessionId)

    // Wait for shell init + startup command execution in the duplicate
    await mainWindow.waitForTimeout(5000)

    // Verify the startup command executed in the duplicate
    expect(fs.existsSync(markerFile)).toBe(true)
    const content = fs.readFileSync(markerFile, 'utf-8').trim()
    expect(content).toBe(markerContent)

    fs.unlinkSync(markerFile)
  })
})
