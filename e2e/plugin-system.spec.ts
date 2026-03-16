import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'
import path from 'path'
import fs from 'fs'
import os from 'os'

// ---------------------------------------------------------------------------
// Fixture setup helpers
// ---------------------------------------------------------------------------

const FIXTURE_PLUGIN_DIR = path.join(__dirname, 'fixtures', 'e2e-test-plugin')
const GLOBAL_PLUGINS_DIR = path.join(os.homedir(), '.smoke', 'plugins')
const INSTALLED_PLUGIN_DIR = path.join(GLOBAL_PLUGINS_DIR, 'e2e-test-plugin')

/**
 * Copy the test fixture plugin into ~/.smoke/plugins/ so the app discovers it.
 */
function installFixturePlugin(): void {
  fs.mkdirSync(INSTALLED_PLUGIN_DIR, { recursive: true })
  for (const file of fs.readdirSync(FIXTURE_PLUGIN_DIR)) {
    fs.copyFileSync(
      path.join(FIXTURE_PLUGIN_DIR, file),
      path.join(INSTALLED_PLUGIN_DIR, file)
    )
  }
}

/**
 * Remove the test fixture plugin from ~/.smoke/plugins/.
 */
function removeFixturePlugin(): void {
  if (fs.existsSync(INSTALLED_PLUGIN_DIR)) {
    fs.rmSync(INSTALLED_PLUGIN_DIR, { recursive: true, force: true })
  }
}

/**
 * Read the fixture plugin's index.js source code for programmatic session creation.
 */
function getPluginSource(): string {
  return fs.readFileSync(path.join(FIXTURE_PLUGIN_DIR, 'index.js'), 'utf-8')
}

/**
 * Open the create menu by clicking the sidebar "+" button.
 */
async function openCreateMenu(page: import('@playwright/test').Page): Promise<void> {
  const createBtn = page.locator('.sidebar-create-btn')
  await createBtn.click()
  await page.waitForTimeout(300)
}

/**
 * Register the test plugin element type in the registry so Canvas can render it.
 * Must be called before creating plugin sessions that need to be visible on canvas.
 */
async function registerPluginType(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const registry = (window as any).__SMOKE_STORES__.pluginRegistry
    // Only register if not already registered
    if (!registry.getPluginElementRegistration('plugin:e2e-test-plugin')) {
      registry.registerPluginElementType({
        type: 'plugin:e2e-test-plugin',
        displayName: 'E2E Test Plugin',
        WindowComponent: registry.PluginWindow,
        ThumbnailComponent: registry.PluginThumbnail,
        defaultSize: { width: 400, height: 300 },
      })
    }
  })
}

/**
 * Create a plugin session programmatically via evaluate().
 * Also registers the plugin element type if needed.
 */
async function createPluginSessionProgrammatically(
  page: import('@playwright/test').Page,
  source: string,
): Promise<string> {
  await registerPluginType(page)
  return page.evaluate((src: string) => {
    const store = (window as any).__SMOKE_STORES__.sessionStore
    const session = store.getState().createPluginSession(
      'plugin:e2e-test-plugin',
      'e2e-test-plugin',
      src,
      {
        name: 'e2e-test-plugin',
        version: '1.0.0',
        entryPoint: 'index.js',
        defaultSize: { width: 400, height: 300 },
      }
    )
    store.getState().focusSession(session.id)
    return session.id
  }, source)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Plugin System: Discovery', () => {
  test.beforeEach(() => {
    installFixturePlugin()
  })

  test.afterEach(() => {
    removeFixturePlugin()
  })

  test('plugin appears in create menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Force reload plugins so the app picks up the fixture
    await mainWindow.evaluate(async () => {
      await window.smokeAPI.plugin.reload()
      // Allow time for the store to update
      await new Promise((r) => setTimeout(r, 500))
    })

    // Open the create menu
    await openCreateMenu(mainWindow)

    // Verify the plugin appears in the Plugins section
    const pluginItem = mainWindow.locator('.create-menu-item', {
      hasText: 'e2e-test-plugin',
    })
    await expect(pluginItem).toBeVisible({ timeout: 5000 })
  })

  test('plugin appears in settings panel', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Force reload plugins
    await mainWindow.evaluate(async () => {
      await window.smokeAPI.plugin.reload()
      await new Promise((r) => setTimeout(r, 500))
    })

    // Open settings modal
    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Scroll to plugin section — look for the plugin name in the list
    const pluginName = modal.locator('.plugin-item-name', {
      hasText: 'e2e-test-plugin',
    })
    await expect(pluginName).toBeVisible({ timeout: 5000 })

    // Verify version is displayed
    const pluginVersion = modal.locator('.plugin-item-version', {
      hasText: 'v1.0.0',
    })
    await expect(pluginVersion).toBeVisible()
  })

  test('plugin listed via IPC', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Reload and check via IPC
    await mainWindow.evaluate(async () => {
      await window.smokeAPI.plugin.reload()
    })

    const pluginInfo = await mainWindow.evaluate(async () => {
      return window.smokeAPI.plugin.get('e2e-test-plugin')
    })

    expect(pluginInfo).not.toBeNull()
    expect((pluginInfo as any).name).toBe('e2e-test-plugin')
    expect((pluginInfo as any).version).toBe('1.0.0')
    expect((pluginInfo as any).description).toBe('Test fixture plugin for E2E tests')
  })
})

test.describe('Plugin System: Rendering', () => {
  test('plugin renders on canvas with window chrome', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const source = getPluginSource()
    const sessionId = await createPluginSessionProgrammatically(mainWindow, source)
    await mainWindow.waitForTimeout(500)

    // Verify a plugin window appeared on the canvas
    const pluginWindow = mainWindow.locator(`.plugin-window[data-session-id="${sessionId}"]`)
    await expect(pluginWindow).toBeVisible({ timeout: 5000 })

    // Verify window chrome is present (title bar with close button)
    const chrome = pluginWindow.locator('.window-chrome')
    await expect(chrome).toBeVisible()

    const closeBtn = pluginWindow.locator('.window-chrome-close')
    await expect(closeBtn).toBeVisible()

    // Verify the plugin sandbox iframe exists
    const sandbox = pluginWindow.locator('.plugin-sandbox')
    await expect(sandbox).toBeVisible()

    const iframe = pluginWindow.locator('.plugin-sandbox-frame')
    await expect(iframe).toBeAttached()
  })

  test('plugin sandbox becomes ready and renders content', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const source = getPluginSource()
    const sessionId = await createPluginSessionProgrammatically(mainWindow, source)

    // Wait for the plugin sandbox to transition to 'ready' state
    const sandbox = mainWindow.locator(
      `.plugin-window[data-session-id="${sessionId}"] .plugin-sandbox`
    )
    await expect(sandbox).toHaveAttribute('data-state', 'ready', { timeout: 15000 })

    // The loading indicator should be gone, iframe should be visible
    const iframe = mainWindow.locator(
      `.plugin-window[data-session-id="${sessionId}"] .plugin-sandbox-frame`
    )
    const display = await iframe.evaluate((el) => getComputedStyle(el).display)
    expect(display).toBe('block')
  })

  test('plugin session appears in sidebar session list', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const source = getPluginSource()
    await createPluginSessionProgrammatically(mainWindow, source)
    await mainWindow.waitForTimeout(500)

    // Check that a session list item for the plugin exists
    const sessionItem = mainWindow.locator('.session-list-item', {
      hasText: 'e2e-test-plugin',
    })
    await expect(sessionItem).toBeVisible({ timeout: 5000 })
  })

  test('plugin window can be closed', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const source = getPluginSource()
    const sessionId = await createPluginSessionProgrammatically(mainWindow, source)
    await mainWindow.waitForTimeout(500)

    const pluginWindow = mainWindow.locator(`.plugin-window[data-session-id="${sessionId}"]`)
    await expect(pluginWindow).toBeVisible({ timeout: 5000 })

    // Close via the window chrome close button
    const closeBtn = pluginWindow.locator('.window-chrome-close')
    await closeBtn.click({ force: true })
    await mainWindow.waitForTimeout(500)

    // Verify the plugin window is gone
    await expect(pluginWindow).toHaveCount(0, { timeout: 5000 })

    // Verify session is removed from store
    const sessionExists = await mainWindow.evaluate((id: string) => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.has(id)
    }, sessionId)
    expect(sessionExists).toBe(false)
  })
})

test.describe('Plugin System: Crash Isolation', () => {
  test('crashing plugin shows error fallback without taking down app', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a plugin session with source code that throws immediately
    const crashSource = 'throw new Error("Intentional crash for E2E test");'
    const sessionId = await createPluginSessionProgrammatically(mainWindow, crashSource)

    // Wait for the sandbox to show error state
    const sandbox = mainWindow.locator(
      `.plugin-window[data-session-id="${sessionId}"] .plugin-sandbox`
    )
    // The sandbox should transition to 'error' (runtime error caught) or stay loading and timeout
    await expect(sandbox).toHaveAttribute('data-state', /error|crashed/, { timeout: 15000 })

    // Verify the error UI is shown
    const errorTitle = mainWindow.locator(
      `.plugin-window[data-session-id="${sessionId}"] .plugin-error-title`
    )
    await expect(errorTitle).toBeVisible({ timeout: 3000 })

    // CRITICAL: Verify the rest of the app is still functional
    // Create a terminal to prove the app didn't crash
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const terminalWindows = mainWindow.locator('.terminal-window:not(.plugin-window)')
    await expect(terminalWindows.first()).toBeVisible({ timeout: 5000 })
  })

  test('plugin timeout shows error after 10s without ready signal', async ({ mainWindow }) => {
    test.setTimeout(120_000) // This test needs more time due to the 10s timeout
    await waitForAppReady(mainWindow)

    // Create a plugin session with source that never calls __ready
    const silentSource = '// This plugin does nothing and never reports ready'
    const sessionId = await createPluginSessionProgrammatically(mainWindow, silentSource)

    // After 10s, the sandbox should timeout and show error
    const sandbox = mainWindow.locator(
      `.plugin-window[data-session-id="${sessionId}"] .plugin-sandbox`
    )
    await expect(sandbox).toHaveAttribute('data-state', 'error', { timeout: 15000 })

    // Verify the timeout error message
    const errorMessage = mainWindow.locator(
      `.plugin-window[data-session-id="${sessionId}"] .plugin-error-message`
    )
    await expect(errorMessage).toContainText('timed out', { timeout: 3000 })
  })
})

test.describe('Plugin System: Enable/Disable', () => {
  test.beforeEach(() => {
    installFixturePlugin()
  })

  test.afterEach(() => {
    removeFixturePlugin()
  })

  test('disable plugin via IPC and verify it is excluded', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Reload plugins to discover fixture
    await mainWindow.evaluate(async () => {
      await window.smokeAPI.plugin.reload()
    })

    // Verify plugin is initially enabled
    const disabledBefore = await mainWindow.evaluate(async () => {
      return window.smokeAPI.plugin.getDisabled()
    })
    expect(disabledBefore).not.toContain('e2e-test-plugin')

    // Disable the plugin
    await mainWindow.evaluate(async () => {
      await window.smokeAPI.plugin.setEnabled('e2e-test-plugin', false)
    })

    // Verify plugin is now disabled
    const disabledAfter = await mainWindow.evaluate(async () => {
      return window.smokeAPI.plugin.getDisabled()
    })
    expect(disabledAfter).toContain('e2e-test-plugin')

    // Re-enable the plugin
    await mainWindow.evaluate(async () => {
      await window.smokeAPI.plugin.setEnabled('e2e-test-plugin', true)
    })

    // Verify plugin is enabled again
    const disabledFinal = await mainWindow.evaluate(async () => {
      return window.smokeAPI.plugin.getDisabled()
    })
    expect(disabledFinal).not.toContain('e2e-test-plugin')
  })
})

test.describe('Plugin System: Settings UI', () => {
  test.beforeEach(() => {
    installFixturePlugin()
  })

  test.afterEach(() => {
    removeFixturePlugin()
  })

  test('plugin config can be read and written via IPC', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Reload plugins
    await mainWindow.evaluate(async () => {
      await window.smokeAPI.plugin.reload()
    })

    // Set a config value
    await mainWindow.evaluate(async () => {
      await window.smokeAPI.plugin.setConfig('e2e-test-plugin', 'greeting', 'Howdy')
    })

    // Read it back
    const config = await mainWindow.evaluate(async () => {
      return window.smokeAPI.plugin.getConfig('e2e-test-plugin')
    })
    expect((config as any).greeting).toBe('Howdy')

    // Set another config value
    await mainWindow.evaluate(async () => {
      await window.smokeAPI.plugin.setConfig('e2e-test-plugin', 'fontSize', 20)
    })

    const config2 = await mainWindow.evaluate(async () => {
      return window.smokeAPI.plugin.getConfig('e2e-test-plugin')
    })
    expect((config2 as any).fontSize).toBe(20)
    // Previous value should still be there
    expect((config2 as any).greeting).toBe('Howdy')
  })
})

test.describe('Plugin System: State Persistence', () => {
  test('plugin session data persists in layout save and load', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await registerPluginType(mainWindow)

    const source = getPluginSource()

    // Create a plugin session with some pluginData
    const sessionId = await mainWindow.evaluate((src: string) => {
      const store = (window as any).__SMOKE_STORES__.sessionStore
      const session = store.getState().createPluginSession(
        'plugin:e2e-test-plugin',
        'e2e-test-plugin',
        src,
        {
          name: 'e2e-test-plugin',
          version: '1.0.0',
          entryPoint: 'index.js',
          defaultSize: { width: 400, height: 300 },
        },
        { testKey: 'testValue', counter: 42 }
      )
      store.getState().focusSession(session.id)
      return session.id
    }, source)

    await mainWindow.waitForTimeout(500)

    // Verify the plugin window is on canvas
    const pluginWindow = mainWindow.locator(`.plugin-window[data-session-id="${sessionId}"]`)
    await expect(pluginWindow).toBeVisible({ timeout: 5000 })

    // Save layout via IPC
    await mainWindow.evaluate(async () => {
      const store = (window as any).__SMOKE_STORES__.sessionStore
      const sessions = Array.from(store.getState().sessions.values())
      const layout = {
        name: 'plugin-persistence-test',
        sessions: sessions.map((s: any) => ({
          type: s.type,
          title: s.title,
          position: s.position,
          size: { width: s.size.width, height: s.size.height },
          pluginData: s.pluginData,
        })),
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      }
      await window.smokeAPI.layout.save('plugin-persistence-test', layout)
    })

    // Close all sessions
    await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__.sessionStore
      const ids = Array.from(store.getState().sessions.keys())
      for (const id of ids) {
        store.getState().removeSession(id)
      }
    })
    await mainWindow.waitForTimeout(500)

    // Verify all sessions are gone
    await expect(pluginWindow).toHaveCount(0, { timeout: 3000 })

    // Load the saved layout
    const loaded = await mainWindow.evaluate(async () => {
      const layout = await window.smokeAPI.layout.load('plugin-persistence-test')
      return layout
    })

    expect(loaded).not.toBeNull()
    expect((loaded as any).sessions.length).toBeGreaterThanOrEqual(1)

    // Verify the plugin session data was persisted in the layout
    const pluginSessionData = (loaded as any).sessions.find(
      (s: any) => s.type === 'plugin:e2e-test-plugin'
    )
    expect(pluginSessionData).toBeDefined()
    expect(pluginSessionData.pluginData.testKey).toBe('testValue')
    expect(pluginSessionData.pluginData.counter).toBe(42)
  })
})

test.describe('Plugin System: Lifecycle', () => {
  test.beforeEach(() => {
    installFixturePlugin()
  })

  test.afterEach(() => {
    removeFixturePlugin()
  })

  test('plugin reload detects newly added plugin', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // First remove the fixture to start clean
    removeFixturePlugin()

    // Wait for TTL cache to expire (2s) before first reload
    await mainWindow.waitForTimeout(2500)

    // Reload — should have no e2e-test-plugin
    const before = await mainWindow.evaluate(async () => {
      const result = await window.smokeAPI.plugin.reload()
      return result.plugins.map((p: any) => p.name)
    })
    expect(before).not.toContain('e2e-test-plugin')

    // Now install the fixture
    installFixturePlugin()

    // Wait for TTL cache to expire (2s) before next reload
    await mainWindow.waitForTimeout(2500)

    // Reload — should now discover it
    const after = await mainWindow.evaluate(async () => {
      const result = await window.smokeAPI.plugin.reload()
      return result.plugins.map((p: any) => p.name)
    })
    expect(after).toContain('e2e-test-plugin')
  })

  test('plugin reload detects removed plugin', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Wait for TTL cache to expire
    await mainWindow.waitForTimeout(2500)

    // Reload — should discover the fixture
    const before = await mainWindow.evaluate(async () => {
      const result = await window.smokeAPI.plugin.reload()
      return result.plugins.map((p: any) => p.name)
    })
    expect(before).toContain('e2e-test-plugin')

    // Remove the fixture
    removeFixturePlugin()

    // Wait for TTL cache to expire (2s)
    await mainWindow.waitForTimeout(2500)

    // Reload — should no longer find it
    const after = await mainWindow.evaluate(async () => {
      const result = await window.smokeAPI.plugin.reload()
      return result.plugins.map((p: any) => p.name)
    })
    expect(after).not.toContain('e2e-test-plugin')
  })
})
