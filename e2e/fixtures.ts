import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import fs from 'fs'
import os from 'os'

/** Path to the built Electron main entry point */
const MAIN_JS = path.join(__dirname, '..', 'out', 'main', 'index.js')

/**
 * Return the path where electron-store persists Smoke's config.
 * macOS: ~/Library/Application Support/Smoke/smoke-config.json
 * Windows: %APPDATA%/Smoke/smoke-config.json
 * Linux: ~/.config/Smoke/smoke-config.json
 */
function getConfigPath(): string {
  const appName = 'Smoke'
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', appName, 'smoke-config.json')
    case 'win32':
      return path.join(process.env.APPDATA || '', appName, 'smoke-config.json')
    default:
      return path.join(os.homedir(), '.config', appName, 'smoke-config.json')
  }
}

export type TestFixtures = {
  /** The launched Electron application */
  electronApp: ElectronApplication
  /** The main BrowserWindow page */
  mainWindow: Page
}

/**
 * Custom Playwright test fixture that:
 * 1. Backs up and resets Smoke config before each test
 * 2. Launches the Electron app with a built main.js
 * 3. Waits for the main window to be ready
 * 4. Provides `electronApp` and `mainWindow` to the test
 * 5. Closes the app and restores config after each test
 */
export const test = base.extend<TestFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const configPath = getConfigPath()
    const backupPath = configPath + '.e2e-backup'

    // Backup existing config
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, backupPath)
    }

    // Reset config to defaults for a clean test
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath)
    }

    const app = await electron.launch({
      args: [MAIN_JS],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // Disable GPU for CI stability
        ELECTRON_DISABLE_GPU: '1',
      },
    })

    await use(app)

    // Teardown: close app and restore config (with timeout fallback)
    try {
      await Promise.race([
        app.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 10000)),
      ])
    } catch {
      // Force kill if close times out
      try { process.kill(app.process().pid!) } catch { /* ignore */ }
    }

    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, configPath)
      fs.unlinkSync(backupPath)
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    // Wait for the first BrowserWindow to open
    const window = await electronApp.firstWindow()

    // Wait for the app to be fully loaded (renderer DOM ready)
    await window.waitForLoadState('domcontentloaded')

    await use(window)
  },
})

export { expect } from '@playwright/test'
