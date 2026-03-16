import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * E2E tests for theme switching and appearance customization.
 *
 * Covers:
 * - Dark ↔ Light theme switching with verification of all major UI elements
 * - All 6 themes apply correct CSS variables
 * - Terminal opacity slider interaction
 * - Font family, font size, and line height changes
 */

// ── Helpers ──

/** Open settings modal and return the modal locator */
async function openSettings(mainWindow: Awaited<ReturnType<typeof test['info']>['fixme']> extends never ? any : any) {
  await pressShortcut(mainWindow, ',')
  const modal = mainWindow.locator('.settings-modal')
  await expect(modal).toBeVisible({ timeout: 3000 })
  return modal
}

/** Read a CSS variable from :root */
async function getCssVar(page: any, varName: string): Promise<string> {
  return page.evaluate(
    (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    varName
  )
}

// ── Theme Switching: Dark ↔ Light ──

test.describe('Theme: Dark ↔ Light switching', () => {
  test('switch from dark to light — all UI elements update', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)
    const themeSelect = modal.locator('.settings-select')

    // Start with dark theme
    await themeSelect.selectOption('dark')
    await mainWindow.waitForTimeout(500)

    // Record dark theme values
    const darkBgBase = await getCssVar(mainWindow, '--bg-base')
    const darkBgSidebar = await getCssVar(mainWindow, '--bg-sidebar')
    const darkAccent = await getCssVar(mainWindow, '--accent')
    const darkTextPrimary = await getCssVar(mainWindow, '--text-primary')

    expect(darkBgBase).toBe('#0d0d1a')
    expect(darkBgSidebar).toBe('#0a0a14')

    // Switch to light theme
    await themeSelect.selectOption('light')
    await mainWindow.waitForTimeout(500)

    // Verify data-theme attribute
    const theme = await mainWindow.evaluate(() => document.documentElement.dataset.theme)
    expect(theme).toBe('light')

    // Verify canvas background (uses --bg-base)
    const lightBgBase = await getCssVar(mainWindow, '--bg-base')
    expect(lightBgBase).toBe('#f0f0f4')
    expect(lightBgBase).not.toBe(darkBgBase)

    // Verify sidebar background (uses --bg-sidebar)
    const lightBgSidebar = await getCssVar(mainWindow, '--bg-sidebar')
    expect(lightBgSidebar).toBe('#e8e8ee')
    expect(lightBgSidebar).not.toBe(darkBgSidebar)

    // Verify terminal window background (uses --bg-window)
    const lightBgWindow = await getCssVar(mainWindow, '--bg-window')
    expect(lightBgWindow).toMatch(/rgba\(255,\s*255,\s*255/)

    // Verify accent color changed
    const lightAccent = await getCssVar(mainWindow, '--accent')
    expect(lightAccent).toBe('#5b6ee1')
    expect(lightAccent).not.toBe(darkAccent)

    // Verify text color changed (dark text on light bg)
    const lightTextPrimary = await getCssVar(mainWindow, '--text-primary')
    expect(lightTextPrimary).toMatch(/rgba\(0,\s*0,\s*0/)
    expect(lightTextPrimary).not.toBe(darkTextPrimary)

    // Verify border color changed
    const lightBorder = await getCssVar(mainWindow, '--border-default')
    expect(lightBorder).toMatch(/rgba\(0,\s*0,\s*0/)

    // Verify actual DOM element computed styles
    // Canvas root uses --bg-base
    const canvasEl = mainWindow.locator('.canvas-root')
    if (await canvasEl.count() > 0) {
      const canvasBg = await canvasEl.evaluate(
        (el) => getComputedStyle(el).backgroundColor
      )
      // Should be a light color
      expect(canvasBg).toBeTruthy()
    }

    // Sidebar uses --bg-sidebar
    const sidebarEl = mainWindow.locator('.sidebar')
    if (await sidebarEl.count() > 0) {
      const sidebarBg = await sidebarEl.evaluate(
        (el) => getComputedStyle(el).backgroundColor
      )
      expect(sidebarBg).toBeTruthy()
    }
  })

  test('switch from light back to dark — all UI elements revert', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)
    const themeSelect = modal.locator('.settings-select')

    // Switch to light first
    await themeSelect.selectOption('light')
    await mainWindow.waitForTimeout(500)

    const lightBgBase = await getCssVar(mainWindow, '--bg-base')
    expect(lightBgBase).toBe('#f0f0f4')

    // Switch back to dark
    await themeSelect.selectOption('dark')
    await mainWindow.waitForTimeout(500)

    const theme = await mainWindow.evaluate(() => document.documentElement.dataset.theme)
    expect(theme).toBe('dark')

    const darkBgBase = await getCssVar(mainWindow, '--bg-base')
    expect(darkBgBase).toBe('#0d0d1a')

    const darkBgSidebar = await getCssVar(mainWindow, '--bg-sidebar')
    expect(darkBgSidebar).toBe('#0a0a14')

    const darkAccent = await getCssVar(mainWindow, '--accent')
    expect(darkAccent).toBe('#7c8cf5')

    const darkTextPrimary = await getCssVar(mainWindow, '--text-primary')
    expect(darkTextPrimary).toMatch(/rgba\(255,\s*255,\s*255/)
  })
})

// ── All Themes ──

test.describe('Theme: All themes apply correct variables', () => {
  const themeExpectations: Record<string, { bgBase: string; accent: string; bgSidebar: string }> = {
    dark: { bgBase: '#0d0d1a', accent: '#7c8cf5', bgSidebar: '#0a0a14' },
    light: { bgBase: '#f0f0f4', accent: '#5b6ee1', bgSidebar: '#e8e8ee' },
    'catppuccin-mocha': { bgBase: '#1e1e2e', accent: '#cba6f7', bgSidebar: '#181825' },
    dracula: { bgBase: '#282a36', accent: '#bd93f9', bgSidebar: '#21222c' },
    nord: { bgBase: '#2e3440', accent: '#88c0d0', bgSidebar: '#292e39' },
    'solarized-dark': { bgBase: '#002b36', accent: '#268bd2', bgSidebar: '#001f27' },
  }

  for (const [themeId, expected] of Object.entries(themeExpectations)) {
    test(`apply ${themeId} theme — verify key CSS variables`, async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)

      const modal = await openSettings(mainWindow)
      const themeSelect = modal.locator('.settings-select')

      await themeSelect.selectOption(themeId)
      await mainWindow.waitForTimeout(500)

      // Verify data-theme attribute
      const appliedTheme = await mainWindow.evaluate(() => document.documentElement.dataset.theme)
      expect(appliedTheme).toBe(themeId)

      // Verify --bg-base (canvas background)
      const bgBase = await getCssVar(mainWindow, '--bg-base')
      expect(bgBase).toBe(expected.bgBase)

      // Verify --bg-sidebar
      const bgSidebar = await getCssVar(mainWindow, '--bg-sidebar')
      expect(bgSidebar).toBe(expected.bgSidebar)

      // Verify --accent
      const accent = await getCssVar(mainWindow, '--accent')
      expect(accent).toBe(expected.accent)

      // Verify the config was persisted
      const storedTheme = await mainWindow.evaluate(() =>
        window.smokeAPI.config.get().then((p: any) => p?.theme)
      )
      expect(storedTheme).toBe(themeId)
    })
  }
})

// ── Terminal Opacity Slider ──

test.describe('Theme: Terminal opacity slider', () => {
  test('reduce opacity — CSS variables update with transparency', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)

    // Find the terminal opacity slider (min=0.1, max=1)
    const opacitySlider = modal.locator('.settings-slider[min="0.1"][max="1"]')
    await expect(opacitySlider).toBeVisible()

    // Set opacity to 50%
    await opacitySlider.fill('0.5')
    await mainWindow.waitForTimeout(500)

    // Verify --bg-terminal has reduced alpha
    const bgTerminal = await getCssVar(mainWindow, '--bg-terminal')
    expect(bgTerminal).toMatch(/rgba\(/)
    const alphaMatch = bgTerminal.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/)
    expect(alphaMatch).toBeTruthy()
    expect(parseFloat(alphaMatch![1])).toBeCloseTo(0.5, 1)

    // Verify frosted glass backdrop filter is applied
    const backdrop = await getCssVar(mainWindow, '--terminal-backdrop')
    expect(backdrop).toBe('blur(12px)')
  })

  test('set opacity to 100% — no transparency', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)
    const opacitySlider = modal.locator('.settings-slider[min="0.1"][max="1"]')

    // First reduce opacity
    await opacitySlider.fill('0.5')
    await mainWindow.waitForTimeout(300)

    // Then set back to 100%
    await opacitySlider.fill('1')
    await mainWindow.waitForTimeout(500)

    // Backdrop filter should be 'none' at full opacity
    const backdrop = await getCssVar(mainWindow, '--terminal-backdrop')
    expect(backdrop).toBe('none')
  })

  test('opacity change persists to config', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)
    const opacitySlider = modal.locator('.settings-slider[min="0.1"][max="1"]')

    await opacitySlider.fill('0.7')
    await mainWindow.waitForTimeout(500)

    const stored = await mainWindow.evaluate(() =>
      window.smokeAPI.config.get().then((p: any) => p?.terminalOpacity)
    )
    expect(stored).toBeCloseTo(0.7, 1)
  })
})

// ── Font Settings ──

test.describe('Appearance: Font family', () => {
  test('change font family — CSS variable and config update', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)

    // Find the font family input
    const fontInput = modal.locator('input[placeholder*="Berkeley Mono"]')
    await expect(fontInput).toBeVisible()

    // Clear and set a new font family
    await fontInput.fill('Fira Code, monospace')
    await mainWindow.waitForTimeout(500)

    // Verify CSS variable updated
    const fontMono = await getCssVar(mainWindow, '--font-mono')
    expect(fontMono).toBe('Fira Code, monospace')

    // Verify config persisted
    const stored = await mainWindow.evaluate(() =>
      window.smokeAPI.config.get().then((p: any) => p?.fontFamily)
    )
    expect(stored).toBe('Fira Code, monospace')
  })
})

test.describe('Appearance: Font size', () => {
  test('change font size — CSS variable updates', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)

    // Find the font size slider (min=8, max=24)
    const fontSizeSlider = modal.locator('.settings-slider[min="8"][max="24"]')
    await expect(fontSizeSlider).toBeVisible()

    // Set font size to 18px
    await fontSizeSlider.fill('18')
    await mainWindow.waitForTimeout(500)

    // Verify CSS variable updated
    const fontSize = await getCssVar(mainWindow, '--font-size-lg')
    expect(fontSize).toBe('18px')

    // Verify config persisted
    const stored = await mainWindow.evaluate(() =>
      window.smokeAPI.config.get().then((p: any) => p?.fontSize)
    )
    expect(stored).toBe(18)
  })

  test('font size range limits', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)
    const fontSizeSlider = modal.locator('.settings-slider[min="8"][max="24"]')

    // Set to minimum
    await fontSizeSlider.fill('8')
    await mainWindow.waitForTimeout(300)

    const minSize = await getCssVar(mainWindow, '--font-size-lg')
    expect(minSize).toBe('8px')

    // Set to maximum
    await fontSizeSlider.fill('24')
    await mainWindow.waitForTimeout(300)

    const maxSize = await getCssVar(mainWindow, '--font-size-lg')
    expect(maxSize).toBe('24px')
  })
})

test.describe('Appearance: Line height', () => {
  test('change line height — CSS variable updates', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)

    // Find the line height slider (min=1, max=2, step=0.1)
    const lineHeightSlider = modal.locator('.settings-slider[min="1"][max="2"]')
    await expect(lineHeightSlider).toBeVisible()

    // Set line height to 1.6
    await lineHeightSlider.fill('1.6')
    await mainWindow.waitForTimeout(500)

    // Verify CSS variable updated
    const lineHeight = await getCssVar(mainWindow, '--line-height-code')
    expect(lineHeight).toBe('1.6')

    // Verify config persisted
    const stored = await mainWindow.evaluate(() =>
      window.smokeAPI.config.get().then((p: any) => p?.lineHeight)
    )
    expect(stored).toBeCloseTo(1.6, 1)
  })
})

// ── Combined: Theme + Font interaction ──

test.describe('Appearance: Theme and font settings interact correctly', () => {
  test('font settings persist across theme changes', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)

    // Set a custom font size
    const fontSizeSlider = modal.locator('.settings-slider[min="8"][max="24"]')
    await fontSizeSlider.fill('16')
    await mainWindow.waitForTimeout(300)

    // Set a custom line height
    const lineHeightSlider = modal.locator('.settings-slider[min="1"][max="2"]')
    await lineHeightSlider.fill('1.5')
    await mainWindow.waitForTimeout(300)

    // Switch theme from dark to light
    const themeSelect = modal.locator('.settings-select')
    await themeSelect.selectOption('light')
    await mainWindow.waitForTimeout(500)

    // Verify font settings were NOT affected by theme change
    const fontSize = await getCssVar(mainWindow, '--font-size-lg')
    expect(fontSize).toBe('16px')

    const lineHeight = await getCssVar(mainWindow, '--line-height-code')
    expect(lineHeight).toBe('1.5')

    // Verify theme DID change
    const bgBase = await getCssVar(mainWindow, '--bg-base')
    expect(bgBase).toBe('#f0f0f4')
  })

  test('opacity interacts correctly with theme switch', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const modal = await openSettings(mainWindow)

    // Set reduced opacity on dark theme
    const opacitySlider = modal.locator('.settings-slider[min="0.1"][max="1"]')
    await opacitySlider.fill('0.6')
    await mainWindow.waitForTimeout(300)

    // Verify dark theme bg-terminal has reduced alpha
    let bgTerminal = await getCssVar(mainWindow, '--bg-terminal')
    expect(bgTerminal).toMatch(/rgba\(/)

    // Switch to light theme — opacity should be re-applied on new theme's bg-window
    const themeSelect = modal.locator('.settings-select')
    await themeSelect.selectOption('light')
    await mainWindow.waitForTimeout(500)

    // Verify --bg-terminal still has transparency (using light theme's window color)
    bgTerminal = await getCssVar(mainWindow, '--bg-terminal')
    expect(bgTerminal).toMatch(/rgba\(/)
    const alphaMatch = bgTerminal.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/)
    expect(alphaMatch).toBeTruthy()
    expect(parseFloat(alphaMatch![1])).toBeCloseTo(0.6, 1)

    // Frosted glass should still be active
    const backdrop = await getCssVar(mainWindow, '--terminal-backdrop')
    expect(backdrop).toBe('blur(12px)')
  })
})
