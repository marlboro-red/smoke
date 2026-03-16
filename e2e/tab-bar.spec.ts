import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

test.describe('Tab Bar Switching and Management', () => {
  test('tab bar shows default tab on launch', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const tabItems = mainWindow.locator('.tab-item')
    await expect(tabItems).toHaveCount(1, { timeout: 5000 })

    // The default tab should be active
    const activeTab = mainWindow.locator('.tab-item.active')
    await expect(activeTab).toBeVisible()
    await expect(activeTab.locator('.tab-item-name')).toHaveText('Canvas 1')
  })

  test('new tab button creates additional tab', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const tabItems = mainWindow.locator('.tab-item')
    const countBefore = await tabItems.count()

    // Click the "+" button to create a new tab
    const newTabBtn = mainWindow.locator('.tab-bar-new')
    await newTabBtn.click()
    await mainWindow.waitForTimeout(500)

    await expect(tabItems).toHaveCount(countBefore + 1, { timeout: 5000 })

    // The new tab should be active
    const activeTab = mainWindow.locator('.tab-item.active')
    await expect(activeTab.locator('.tab-item-name')).toHaveText(`Canvas ${countBefore + 1}`)
  })

  test('click tab to switch focus', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Wait for tab bar to initialize
    await expect(mainWindow.locator('.tab-item.active')).toBeVisible({ timeout: 5000 })

    // Create a terminal in the first tab so it has content
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    // Create a second tab
    const newTabBtn = mainWindow.locator('.tab-bar-new')
    await newTabBtn.click()
    await mainWindow.waitForTimeout(1000)

    const tabItems = mainWindow.locator('.tab-item')
    await expect(tabItems).toHaveCount(2, { timeout: 5000 })

    // Second tab should be active now
    const secondTab = tabItems.nth(1)
    await expect(secondTab).toHaveClass(/active/, { timeout: 3000 })

    // Click the first tab to switch back
    const firstTab = tabItems.nth(0)
    await firstTab.click()
    await mainWindow.waitForTimeout(1000)

    // First tab should now be active
    await expect(firstTab).toHaveClass(/active/, { timeout: 3000 })
    await expect(secondTab).not.toHaveClass(/active/)
  })

  test('tab close button removes the tab', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await expect(mainWindow.locator('.tab-item.active')).toBeVisible({ timeout: 5000 })

    // Create a second tab
    const newTabBtn = mainWindow.locator('.tab-bar-new')
    await newTabBtn.click()
    await mainWindow.waitForTimeout(1000)

    const tabItems = mainWindow.locator('.tab-item')
    await expect(tabItems).toHaveCount(2, { timeout: 5000 })

    // Close the second tab via its close button
    const secondTab = tabItems.nth(1)
    const closeBtn = secondTab.locator('.tab-item-close')
    // Force click since close button is opacity:0 until hover
    await closeBtn.click({ force: true })

    // Should be back to one tab
    await expect(tabItems).toHaveCount(1, { timeout: 5000 })

    // The remaining tab should be active
    const activeTab = mainWindow.locator('.tab-item.active')
    await expect(activeTab).toBeVisible({ timeout: 3000 })
  })

  test('cannot close the last remaining tab', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await expect(mainWindow.locator('.tab-item.active')).toBeVisible({ timeout: 5000 })

    const tabItems = mainWindow.locator('.tab-item')
    await expect(tabItems).toHaveCount(1, { timeout: 5000 })

    // The single tab should not have a close button (conditionally not rendered)
    const closeBtn = tabItems.first().locator('.tab-item-close')
    await expect(closeBtn).toHaveCount(0)
  })

  test('closing active tab switches to adjacent tab', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await expect(mainWindow.locator('.tab-item.active')).toBeVisible({ timeout: 5000 })

    const newTabBtn = mainWindow.locator('.tab-bar-new')

    // Create two additional tabs (total: 3)
    await newTabBtn.click()
    await mainWindow.waitForTimeout(1000)
    await newTabBtn.click()
    await mainWindow.waitForTimeout(1000)

    const tabItems = mainWindow.locator('.tab-item')
    await expect(tabItems).toHaveCount(3, { timeout: 5000 })

    // Third tab (index 2) should be active
    await expect(tabItems.nth(2)).toHaveClass(/active/, { timeout: 3000 })

    // Close the active (third) tab
    const closeBtn = tabItems.nth(2).locator('.tab-item-close')
    await closeBtn.click({ force: true })

    // Should now have 2 tabs, and one of them should be active
    await expect(tabItems).toHaveCount(2, { timeout: 5000 })
    const activeTab = mainWindow.locator('.tab-item.active')
    await expect(activeTab).toBeVisible({ timeout: 3000 })
  })

  test('tab switching preserves sessions per tab', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await expect(mainWindow.locator('.tab-item.active')).toBeVisible({ timeout: 5000 })

    // Create a terminal in the first tab
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const terminalWindows = mainWindow.locator('.terminal-window')
    await expect(terminalWindows.first()).toBeVisible({ timeout: 5000 })
    const tab1TerminalCount = await terminalWindows.count()

    // Create a second tab (clears canvas)
    const newTabBtn = mainWindow.locator('.tab-bar-new')
    await newTabBtn.click()

    // Wait for tab switch to complete and canvas to clear
    await mainWindow.waitForFunction(() => {
      return document.querySelectorAll('.terminal-window').length === 0
    }, undefined, { timeout: 10000 })

    // Create a terminal in the second tab
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)
    await expect(terminalWindows.first()).toBeVisible({ timeout: 5000 })

    // Switch back to the first tab
    const tabItems = mainWindow.locator('.tab-item')
    await tabItems.nth(0).click()

    // Wait for layout restoration — terminal should reappear
    await mainWindow.waitForFunction((expectedCount) => {
      return document.querySelectorAll('.terminal-window').length === expectedCount
    }, tab1TerminalCount, { timeout: 10000 })

    const restoredCount = await terminalWindows.count()
    expect(restoredCount).toBe(tab1TerminalCount)
  })

  test('tab rename via double-click', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const tabItems = mainWindow.locator('.tab-item')
    const firstTab = tabItems.first()

    // Double-click to start rename
    await firstTab.dblclick()

    // Rename input should appear
    const renameInput = firstTab.locator('.tab-item-name-input')
    await expect(renameInput).toBeVisible({ timeout: 3000 })

    // Clear and type new name
    await renameInput.fill('My Custom Tab')
    await renameInput.press('Enter')

    // Input should disappear, name should update
    await expect(renameInput).toBeHidden({ timeout: 3000 })
    await expect(firstTab.locator('.tab-item-name')).toHaveText('My Custom Tab')
  })

  test('tab rename escape cancels without saving', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const tabItems = mainWindow.locator('.tab-item')
    const firstTab = tabItems.first()
    const originalName = await firstTab.locator('.tab-item-name').textContent()

    // Double-click to start rename
    await firstTab.dblclick()
    const renameInput = firstTab.locator('.tab-item-name-input')
    await expect(renameInput).toBeVisible({ timeout: 3000 })

    // Type something different then press Escape
    await renameInput.fill('Should Not Save')
    await renameInput.press('Escape')

    // Name should remain unchanged
    await expect(renameInput).toBeHidden({ timeout: 3000 })
    await expect(firstTab.locator('.tab-item-name')).toHaveText(originalName!)
  })
})
