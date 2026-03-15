import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'
import { _electron as electron } from 'playwright'
import path from 'path'
import fs from 'fs'
import os from 'os'

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

test.describe('Settings Dialog', () => {
  test('open settings via Cmd+,', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, ',')

    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Verify header
    const title = modal.locator('.settings-title')
    await expect(title).toHaveText('Settings')
  })

  test('close settings via Escape', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    await mainWindow.keyboard.press('Escape')
    await expect(modal).not.toBeVisible({ timeout: 3000 })
  })

  test('close settings via backdrop click', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Click the backdrop (outside the modal)
    const backdrop = mainWindow.locator('.settings-backdrop')
    await backdrop.click({ position: { x: 10, y: 10 } })
    await expect(modal).not.toBeVisible({ timeout: 3000 })
  })

  test('close settings via close button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    const closeBtn = modal.locator('.settings-close-btn')
    await closeBtn.click()
    await expect(modal).not.toBeVisible({ timeout: 3000 })
  })
})

test.describe('Settings: Shell Preference', () => {
  test('change default shell preference', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Find the Default Shell input
    const shellInput = modal.locator('input[placeholder="System default"]')
    await expect(shellInput).toBeVisible()

    // Clear and type a new shell path
    await shellInput.fill('/bin/zsh')

    // Verify the value was set
    await expect(shellInput).toHaveValue('/bin/zsh')

    // Verify it was persisted to the store
    const storedShell = await mainWindow.evaluate(() => {
      return window.smokeAPI.config.get().then((p: any) => p?.defaultShell)
    })
    expect(storedShell).toBe('/bin/zsh')
  })
})

test.describe('Settings: Grid Size', () => {
  test('change grid size and verify store update', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Find the grid size slider (min=10, max=50)
    const gridSlider = modal.locator('.settings-slider[min="10"][max="50"]')
    await expect(gridSlider).toBeVisible()

    // Change the grid size to 30 via the slider
    await gridSlider.fill('30')

    // Wait for the preference to propagate
    await mainWindow.waitForTimeout(500)

    // Verify the persisted config has the new grid size
    const storedGridSize = await mainWindow.evaluate(() => {
      return window.smokeAPI.config.get().then((p: any) => p?.gridSize)
    })
    expect(storedGridSize).toBe(30)
  })
})

test.describe('Settings: Sidebar Position', () => {
  test('toggle sidebar position to right and back to left', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const appLayout = mainWindow.locator('.app-layout')

    // Open settings
    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // First ensure sidebar is on the left
    const leftBtn = modal.locator('.settings-option-btn', { hasText: 'Left' })
    await leftBtn.click()
    await mainWindow.waitForTimeout(500)

    const leftDirection = await appLayout.evaluate(
      (el) => getComputedStyle(el).flexDirection
    )
    expect(leftDirection).toBe('row')

    // Now switch to right
    const rightBtn = modal.locator('.settings-option-btn', { hasText: 'Right' })
    await rightBtn.click()
    await mainWindow.waitForTimeout(500)

    // Verify sidebar moved — flexDirection should be row-reverse
    const rightDirection = await appLayout.evaluate(
      (el) => getComputedStyle(el).flexDirection
    )
    expect(rightDirection).toBe('row-reverse')

    // Switch back to left
    await leftBtn.click()
    await mainWindow.waitForTimeout(500)

    // Verify sidebar moved back — flexDirection should be row
    const backToLeft = await appLayout.evaluate(
      (el) => getComputedStyle(el).flexDirection
    )
    expect(backToLeft).toBe('row')
  })
})

test.describe('Settings: Theme', () => {
  test('change theme and verify UI updates', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open settings
    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // Reset to dark theme first (may have leaked state from prior run)
    const themeSelect = modal.locator('.settings-select')
    await themeSelect.selectOption('dark')
    await mainWindow.waitForTimeout(500)

    const darkTheme = await mainWindow.evaluate(() =>
      document.documentElement.dataset.theme
    )
    expect(darkTheme).toBe('dark')

    // Now change to 'nord'
    await themeSelect.selectOption('nord')
    await mainWindow.waitForTimeout(500)

    // Verify the data-theme attribute changed
    const newTheme = await mainWindow.evaluate(() =>
      document.documentElement.dataset.theme
    )
    expect(newTheme).toBe('nord')

    // Verify CSS variables changed (Nord has --bg-base: #2e3440)
    const bgBase = await mainWindow.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim()
    )
    expect(bgBase).toBe('#2e3440')
  })

  test('change theme to light and verify', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, ',')
    const modal = mainWindow.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    const themeSelect = modal.locator('.settings-select')
    await themeSelect.selectOption('light')
    await mainWindow.waitForTimeout(500)

    const theme = await mainWindow.evaluate(() =>
      document.documentElement.dataset.theme
    )
    expect(theme).toBe('light')

    // Light theme has --bg-base: #f0f0f4
    const bgBase = await mainWindow.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim()
    )
    expect(bgBase).toBe('#f0f0f4')
  })
})

test.describe('Settings: Persistence', () => {
  test('settings persist after app restart', async ({ electronApp }) => {
    test.setTimeout(120_000)
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await waitForAppReady(window)

    // Open settings and change theme to 'dracula'
    await pressShortcut(window, ',')
    const modal = window.locator('.settings-modal')
    await expect(modal).toBeVisible({ timeout: 3000 })

    const themeSelect = modal.locator('.settings-select')
    await themeSelect.selectOption('dracula')
    await window.waitForTimeout(1000)

    // Change sidebar position to right
    const rightBtn = modal.locator('.settings-option-btn', { hasText: 'Right' })
    await rightBtn.click()
    await window.waitForTimeout(1000)

    // Change grid size to 40
    const gridSlider = modal.locator('.settings-slider[min="10"][max="50"]')
    await gridSlider.fill('40')
    await window.waitForTimeout(1000)

    // Close settings and wait for all IPC to complete
    await window.keyboard.press('Escape')
    await window.waitForTimeout(1000)

    // Verify settings were persisted before closing the app
    const savedConfig = await window.evaluate(() => {
      return window.smokeAPI.config.get()
    })
    expect((savedConfig as any).theme).toBe('dracula')
    expect((savedConfig as any).sidebarPosition).toBe('right')
    expect((savedConfig as any).gridSize).toBe(40)

    // Close the app — config should be written to disk by electron-store
    await electronApp.close()

    // Small delay to ensure config file is flushed
    await new Promise((r) => setTimeout(r, 500))

    // Relaunch the app
    const app2 = await electron.launch({
      args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_DISABLE_GPU: '1',
      },
    })

    try {
      const window2 = await app2.firstWindow()
      await window2.waitForLoadState('domcontentloaded')
      await waitForAppReady(window2)

      // Wait for preferences to load
      await window2.waitForTimeout(2000)

      // Verify the theme was restored
      const restoredTheme = await window2.evaluate(() =>
        document.documentElement.dataset.theme
      )
      expect(restoredTheme).toBe('dracula')

      // Verify sidebar position was restored (row-reverse = right)
      const appLayout = window2.locator('.app-layout')
      const direction = await appLayout.evaluate(
        (el) => getComputedStyle(el).flexDirection
      )
      expect(direction).toBe('row-reverse')

      // Verify grid size was restored by reading from the config API
      const restoredGridSize = await window2.evaluate(() => {
        return window.smokeAPI.config.get().then((p: any) => p?.gridSize)
      })
      expect(restoredGridSize).toBe(40)
    } finally {
      await app2.close()
      // Clean up the config file so the fixture's teardown doesn't conflict
      const cfgPath = getConfigPath()
      if (fs.existsSync(cfgPath)) {
        fs.unlinkSync(cfgPath)
      }
    }
  })
})

test.describe('Settings: Terminal Opacity', () => {
  test('terminal opacity applies to CSS on app startup', async ({ electronApp }) => {
    test.setTimeout(120_000)
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await waitForAppReady(window)

    // Set terminal opacity to 50% and close the app
    await window.evaluate(() => {
      return window.smokeAPI.config.set('terminalOpacity', 0.5)
    })
    await window.waitForTimeout(1000)

    await electronApp.close()

    // Relaunch — App.tsx calls applyTerminalOpacity on mount
    const app2 = await electron.launch({
      args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_DISABLE_GPU: '1',
      },
    })

    try {
      const window2 = await app2.firstWindow()
      await window2.waitForLoadState('domcontentloaded')
      await waitForAppReady(window2)
      await window2.waitForTimeout(2000)

      // Verify the --bg-terminal CSS variable has reduced alpha
      const bgTerminal = await window2.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-terminal').trim()
      )
      expect(bgTerminal).toMatch(/rgba\(/)
      const alphaMatch = bgTerminal.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/)
      expect(alphaMatch).toBeTruthy()
      expect(parseFloat(alphaMatch![1])).toBeCloseTo(0.5, 1)

      // Verify the frosted glass backdrop filter is applied
      const backdrop = await window2.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--terminal-backdrop').trim()
      )
      expect(backdrop).toBe('blur(12px)')
    } finally {
      await app2.close()
      // Clean up config
      const configPath = getConfigPath()
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath)
      }
    }
  })

  test('terminal opacity at 100% has no transparency on startup', async ({ electronApp }) => {
    test.setTimeout(120_000)
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await waitForAppReady(window)

    // Set terminal opacity to 100% and close the app
    await window.evaluate(() => {
      return window.smokeAPI.config.set('terminalOpacity', 1)
    })
    await window.waitForTimeout(1000)

    await electronApp.close()

    // Relaunch
    const app2 = await electron.launch({
      args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_DISABLE_GPU: '1',
      },
    })

    try {
      const window2 = await app2.firstWindow()
      await window2.waitForLoadState('domcontentloaded')
      await waitForAppReady(window2)
      await window2.waitForTimeout(2000)

      // At full opacity, backdrop filter should be 'none'
      const backdrop = await window2.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--terminal-backdrop').trim()
      )
      expect(backdrop).toBe('none')
    } finally {
      await app2.close()
      const configPath = getConfigPath()
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath)
      }
    }
  })
})
