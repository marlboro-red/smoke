import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut, evaluate } from './helpers'

/**
 * E2E tests for the shortcuts overlay and custom keybinding flow.
 * Issue: smoke-03p.21
 */

const EXPECTED_GROUP_TITLES = [
  'Session Management',
  'Session Focus',
  'Split Panes',
  'Canvas',
  'Groups',
  'Layout & Settings',
  'AI & Tools',
  'General',
  'Other', // hardcoded in ShortcutsOverlay.tsx
]

const GROUP_ACTION_COUNTS: Record<string, number> = {
  'Session Management': 8,
  'Session Focus': 9,
  'Split Panes': 7,
  'Canvas': 16,
  'Groups': 2,
  'Layout & Settings': 4,
  'AI & Tools': 2,
  'General': 2,
  'Other': 1,
}

test.describe('Shortcuts Overlay: Open via Cmd+/ and verify grouped display', () => {
  test('Cmd+/ opens the shortcuts overlay', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Press Cmd+/ (the default binding for showShortcutsHelp)
    await pressShortcut(mainWindow, '/')
    await mainWindow.waitForTimeout(300)

    const overlay = mainWindow.locator('.shortcuts-modal')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    const title = overlay.locator('.shortcuts-title')
    await expect(title).toHaveText('Keyboard Shortcuts')
  })

  test('overlay displays all shortcut groups with correct titles', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, '/')
    await mainWindow.waitForTimeout(300)

    const overlay = mainWindow.locator('.shortcuts-modal')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    const sections = overlay.locator('.shortcuts-section')
    const sectionCount = await sections.count()
    expect(sectionCount).toBe(EXPECTED_GROUP_TITLES.length)

    // Verify each group title is present
    for (const expectedTitle of EXPECTED_GROUP_TITLES) {
      const sectionTitle = overlay.locator('.shortcuts-section-title', { hasText: expectedTitle })
      await expect(sectionTitle).toBeVisible()
    }
  })

  test('each group contains the correct number of shortcuts', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, '/')
    await mainWindow.waitForTimeout(300)

    const overlay = mainWindow.locator('.shortcuts-modal')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    const sections = overlay.locator('.shortcuts-section')
    const sectionCount = await sections.count()

    for (let i = 0; i < sectionCount; i++) {
      const section = sections.nth(i)
      const titleEl = section.locator('.shortcuts-section-title')
      const titleText = await titleEl.textContent()

      const rows = section.locator('.shortcuts-row')
      const rowCount = await rows.count()

      const expectedCount = GROUP_ACTION_COUNTS[titleText || '']
      expect(rowCount, `Group "${titleText}" should have ${expectedCount} shortcuts`).toBe(expectedCount)
    }
  })

  test('shortcuts display correct key badges for known bindings', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, '/')
    await mainWindow.waitForTimeout(300)

    const overlay = mainWindow.locator('.shortcuts-modal')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    // Verify a few specific shortcuts have the expected key labels
    // "New Session" should show Cmd (⌘) + N
    const newSessionRow = overlay.locator('.shortcuts-row').filter({ hasText: 'New Session' }).first()
    const newSessionKeys = newSessionRow.locator('.shortcut-key')
    const newSessionKeyTexts = await newSessionKeys.allTextContents()
    expect(newSessionKeyTexts).toContain('N')

    // "Zoom In" should show Cmd (⌘) + =
    const zoomInRow = overlay.locator('.shortcuts-row').filter({ hasText: 'Zoom In' })
    const zoomInKeys = zoomInRow.locator('.shortcut-key')
    const zoomInKeyTexts = await zoomInKeys.allTextContents()
    expect(zoomInKeyTexts).toContain('=')

    // "Command Palette" should show Cmd (⌘) + P
    const paletteRow = overlay.locator('.shortcuts-row').filter({ hasText: 'Command Palette' })
    const paletteKeys = paletteRow.locator('.shortcut-key')
    const paletteKeyTexts = await paletteKeys.allTextContents()
    expect(paletteKeyTexts).toContain('P')
  })

  test('Cmd+/ toggles overlay closed', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open
    await pressShortcut(mainWindow, '/')
    const overlay = mainWindow.locator('.shortcuts-modal')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    // Close with same shortcut
    await pressShortcut(mainWindow, '/')
    await expect(overlay).not.toBeVisible({ timeout: 3000 })
  })
})

test.describe('Custom Keybinding: Rebind via Settings UI', () => {
  test('rebind Reset Zoom through settings and verify new binding works', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // ── Step 1: Open Settings ──
    await pressShortcut(mainWindow, ',')
    const settingsModal = mainWindow.locator('.settings-modal')
    await expect(settingsModal).toBeVisible({ timeout: 5000 })

    // ── Step 2: Scroll to keyboard shortcuts section and find Reset Zoom ──
    const shortcutSection = settingsModal.locator('.settings-section').filter({ hasText: 'Keyboard Shortcuts' })
    await shortcutSection.scrollIntoViewIfNeeded()

    const resetZoomRow = shortcutSection.locator('.sc-row').filter({ hasText: 'Reset Zoom' })
    await expect(resetZoomRow).toBeVisible({ timeout: 3000 })

    // ── Step 3: Click the edit button to enter capture mode ──
    const editBtn = resetZoomRow.locator('.sc-edit-btn')
    await editBtn.click()

    // Should show "Press keys..." capture prompt
    const captureBtn = resetZoomRow.locator('.sc-capture-btn')
    await expect(captureBtn).toBeVisible({ timeout: 3000 })
    const captureText = await captureBtn.textContent()
    expect(captureText).toContain('Press keys')

    // ── Step 4: Press new key combination (Cmd+Shift+R) ──
    await mainWindow.keyboard.press('Meta+Shift+r')
    await mainWindow.waitForTimeout(300)

    // Capture mode should end, the edit button should reappear with new binding
    await expect(captureBtn).not.toBeVisible({ timeout: 3000 })
    const updatedEditBtn = resetZoomRow.locator('.sc-edit-btn')
    await expect(updatedEditBtn).toBeVisible({ timeout: 3000 })

    // Verify the displayed binding shows the new keys (should contain R and Shift)
    const keyBadges = updatedEditBtn.locator('.shortcut-key')
    const keyTexts = await keyBadges.allTextContents()
    expect(keyTexts).toContain('Shift')
    expect(keyTexts).toContain('R')

    // ── Step 5: Close Settings ──
    const closeBtn = settingsModal.locator('.settings-close-btn')
    await closeBtn.click()
    await expect(settingsModal).not.toBeVisible({ timeout: 3000 })

    // ── Step 6: Verify the new binding (Cmd+Shift+R) resets zoom ──
    // First zoom in
    await pressShortcut(mainWindow, '=')
    await mainWindow.waitForTimeout(300)

    const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
    await expect(zoomBtn).toHaveText('120%', { timeout: 3000 })

    // Press new binding: Cmd+Shift+R
    await mainWindow.keyboard.press('Meta+Shift+r')
    await mainWindow.waitForTimeout(300)

    // Should reset to 100%
    await expect(zoomBtn).toHaveText('100%', { timeout: 3000 })
  })

  test('old binding stops working after rebind', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // ── Rebind Reset Zoom (Cmd+0) to Cmd+Shift+R programmatically ──
    await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__
      // Use the shortcutBindingsStore to update the binding
      const { shortcutBindingsStore } = store
      if (shortcutBindingsStore) {
        shortcutBindingsStore.getState().updateBinding('resetZoom', {
          key: 'r',
          mod: true,
          shift: true,
          alt: false,
        })
      }
    })
    await mainWindow.waitForTimeout(300)

    // ── Zoom in first ──
    await pressShortcut(mainWindow, '=')
    await mainWindow.waitForTimeout(300)

    const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
    await expect(zoomBtn).toHaveText('120%', { timeout: 3000 })

    // ── Press old binding (Cmd+0) — should NOT reset zoom ──
    await pressShortcut(mainWindow, '0')
    await mainWindow.waitForTimeout(500)

    // Zoom should still be 120% (old binding no longer works)
    await expect(zoomBtn).toHaveText('120%')

    // ── Press new binding (Cmd+Shift+R) — should reset zoom ──
    await mainWindow.keyboard.press('Meta+Shift+r')
    await mainWindow.waitForTimeout(300)

    await expect(zoomBtn).toHaveText('100%', { timeout: 3000 })
  })

  test('reset all restores default bindings', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // ── Rebind Reset Zoom programmatically ──
    await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__
      if (store.shortcutBindingsStore) {
        store.shortcutBindingsStore.getState().updateBinding('resetZoom', {
          key: 'r',
          mod: true,
          shift: true,
          alt: false,
        })
      }
    })
    await mainWindow.waitForTimeout(300)

    // ── Open Settings ──
    await pressShortcut(mainWindow, ',')
    const settingsModal = mainWindow.locator('.settings-modal')
    await expect(settingsModal).toBeVisible({ timeout: 5000 })

    // ── Scroll to keyboard shortcuts and click "Reset All to Defaults" ──
    // The button may be occluded by the minimap canvas, so scroll the settings
    // body to fully expose it, then use dispatchEvent to reliably trigger the click
    const settingsBody = settingsModal.locator('.settings-body')
    await settingsBody.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await mainWindow.waitForTimeout(300)

    const resetAllBtn = settingsModal.locator('.sc-reset-all-btn')
    await expect(resetAllBtn).toBeVisible({ timeout: 3000 })
    await expect(resetAllBtn).toBeEnabled()
    await resetAllBtn.dispatchEvent('click')
    await mainWindow.waitForTimeout(500)

    // ── Close Settings via Escape ──
    await mainWindow.keyboard.press('Escape')
    await expect(settingsModal).not.toBeVisible({ timeout: 3000 })

    // ── Verify Cmd+0 (default binding) resets zoom again ──
    await pressShortcut(mainWindow, '=')
    await mainWindow.waitForTimeout(300)

    const zoomBtn = mainWindow.locator('.status-bar-zoom-btn')
    await expect(zoomBtn).toHaveText('120%', { timeout: 3000 })

    await pressShortcut(mainWindow, '0')
    await mainWindow.waitForTimeout(300)

    await expect(zoomBtn).toHaveText('100%', { timeout: 3000 })
  })
})
