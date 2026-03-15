import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

test.describe('Sidebar Session List and Interaction', () => {
  test('sidebar shows all open sessions', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sessionItems = mainWindow.locator('.session-list-item')
    const countBefore = await sessionItems.count()

    // Create 3 terminals
    for (let i = 0; i < 3; i++) {
      await pressShortcut(mainWindow, 'n')
      await mainWindow.waitForTimeout(500)
    }

    // Sidebar should list 3 additional sessions
    await expect(sessionItems).toHaveCount(countBefore + 3, { timeout: 5000 })

    // The newly created items should have running status dots
    const runningDots = mainWindow.locator('.session-list-item .status-dot.running')
    const runningCount = await runningDots.count()
    expect(runningCount).toBeGreaterThanOrEqual(3)
  })

  test('click sidebar item to focus and pan to session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two terminals and track their IDs
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const firstWindow = mainWindow.locator('.terminal-window.focused')
    await expect(firstWindow).toBeVisible({ timeout: 5000 })
    const firstId = await firstWindow.getAttribute('data-session-id')

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    // Second terminal should now be focused
    const focusedAfterSecond = mainWindow.locator('.terminal-window.focused')
    const secondId = await focusedAfterSecond.getAttribute('data-session-id')
    expect(secondId).not.toBe(firstId)

    // Find the sidebar item for the first terminal and click it
    const sessionItems = mainWindow.locator('.session-list-item')
    // Sessions are sorted by createdAt, so the first created terminal's sidebar item
    // is the one we need to find. Click through sidebar items to find the one that focuses our first terminal.
    const itemCount = await sessionItems.count()
    for (let i = 0; i < itemCount; i++) {
      await sessionItems.nth(i).click()
      await mainWindow.waitForTimeout(300)
      const currentFocused = mainWindow.locator('.terminal-window.focused')
      const currentId = await currentFocused.getAttribute('data-session-id')
      if (currentId === firstId) {
        // Verify the clicked sidebar item has .focused class
        await expect(sessionItems.nth(i)).toHaveClass(/focused/)
        return // test passed
      }
    }

    // If we got here, we never focused the first terminal via sidebar
    expect(false).toBe(true) // fail: could not focus first terminal via sidebar click
  })

  test('right-click sidebar item opens context menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    // Find the last session-list-item (just created)
    const sessionItems = mainWindow.locator('.session-list-item')
    const lastItem = sessionItems.last()
    await expect(lastItem).toBeVisible({ timeout: 5000 })

    // Right-click the session item
    await lastItem.click({ button: 'right' })

    // Context menu should appear with expected options
    const contextMenu = mainWindow.locator('.sidebar-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    const renameBtn = contextMenu.locator('.context-menu-item', { hasText: 'Rename' })
    const lockBtn = contextMenu.locator('.context-menu-item', { hasText: 'Lock Position' })
    const startupBtn = contextMenu.locator('.context-menu-item', { hasText: 'Set Startup Command' })
    const pinBtn = contextMenu.locator('.context-menu-item', { hasText: 'Pin to Viewport' })
    const closeBtn = contextMenu.locator('.context-menu-item', { hasText: 'Close' })

    await expect(renameBtn).toBeVisible()
    await expect(lockBtn).toBeVisible()
    await expect(startupBtn).toBeVisible()
    await expect(pinBtn).toBeVisible()
    await expect(closeBtn).toBeVisible()

    // Close context menu by pressing Escape
    await mainWindow.keyboard.press('Escape')
    await expect(contextMenu).toBeHidden({ timeout: 3000 })
  })

  test('rename session via sidebar double-click', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    // The last sidebar item is the one we just created
    const sessionItems = mainWindow.locator('.session-list-item')
    const lastItem = sessionItems.last()
    await expect(lastItem).toBeVisible({ timeout: 5000 })

    // Double-click the session title to start rename
    const sessionTitle = lastItem.locator('.session-title')
    await sessionTitle.dblclick()

    // Rename input should appear
    const renameInput = lastItem.locator('.session-title-input')
    await expect(renameInput).toBeVisible({ timeout: 3000 })

    // Clear and type new name
    await renameInput.fill('My Renamed Session')
    await renameInput.press('Enter')

    // Input should disappear, title should update
    await expect(renameInput).toBeHidden({ timeout: 3000 })
    const updatedTitle = lastItem.locator('.session-title')
    await expect(updatedTitle).toHaveText('My Renamed Session')
  })

  test('rename session via context menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const sessionItems = mainWindow.locator('.session-list-item')
    const lastItem = sessionItems.last()
    await expect(lastItem).toBeVisible({ timeout: 5000 })

    // Right-click to open context menu, click Rename
    await lastItem.click({ button: 'right' })
    const contextMenu = mainWindow.locator('.sidebar-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    const renameBtn = contextMenu.locator('.context-menu-item', { hasText: 'Rename' })
    await renameBtn.click()

    // Rename input should appear
    const renameInput = lastItem.locator('.session-title-input')
    await expect(renameInput).toBeVisible({ timeout: 3000 })

    await renameInput.fill('Context Menu Rename')
    await renameInput.press('Enter')

    const updatedTitle = lastItem.locator('.session-title')
    await expect(updatedTitle).toHaveText('Context Menu Rename')
  })

  test('session count updates on create and close', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sessionItems = mainWindow.locator('.session-list-item')
    const countBefore = await sessionItems.count()

    // Create first terminal
    await pressShortcut(mainWindow, 'n')
    await expect(sessionItems).toHaveCount(countBefore + 1, { timeout: 5000 })

    // Create second terminal
    await pressShortcut(mainWindow, 'n')
    await expect(sessionItems).toHaveCount(countBefore + 2, { timeout: 5000 })

    // Create third terminal
    await pressShortcut(mainWindow, 'n')
    await expect(sessionItems).toHaveCount(countBefore + 3, { timeout: 5000 })

    // Close focused terminal via Cmd+W
    await pressShortcut(mainWindow, 'w')
    await expect(sessionItems).toHaveCount(countBefore + 2, { timeout: 5000 })

    // Click a remaining session to ensure focus before closing again
    await sessionItems.last().click()
    await mainWindow.waitForTimeout(300)

    // Close another
    await pressShortcut(mainWindow, 'w')
    await expect(sessionItems).toHaveCount(countBefore + 1, { timeout: 5000 })
  })

  test('close session via context menu', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    const sessionItems = mainWindow.locator('.session-list-item')
    const countAfterCreate = await sessionItems.count()
    expect(countAfterCreate).toBeGreaterThanOrEqual(1)

    // Right-click the last item (the one we just created) and close via context menu
    const lastItem = sessionItems.last()
    await lastItem.click({ button: 'right' })
    const contextMenu = mainWindow.locator('.sidebar-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    const closeBtn = contextMenu.locator('.context-menu-item.destructive', { hasText: 'Close' })
    await closeBtn.click()

    await expect(sessionItems).toHaveCount(countAfterCreate - 1, { timeout: 5000 })
  })

  test('sidebar section dividers exist for resizing', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sidebar = mainWindow.locator('.sidebar')
    await expect(sidebar).toBeVisible({ timeout: 5000 })

    // Verify section dividers exist (sessions/fileTree, fileTree/layouts, layouts/bookmarks, bookmarks/recordings)
    const dividers = sidebar.locator('.sidebar-section-divider')
    await expect(dividers).toHaveCount(4, { timeout: 5000 })

    // Verify sidebar sections exist
    const sections = sidebar.locator('.sidebar-section')
    await expect(sections).toHaveCount(4, { timeout: 5000 })
  })

  test('sidebar section resize via drag', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const sidebar = mainWindow.locator('.sidebar')
    await expect(sidebar).toBeVisible({ timeout: 5000 })

    // Use the first divider (between session-list and fileTree)
    // Drag UP to shrink session-list and grow fileTree
    const divider = sidebar.locator('.sidebar-section-divider').first()
    await expect(divider).toBeVisible()

    // Get fileTree section (first .sidebar-section) initial height
    const fileTreeSection = sidebar.locator('.sidebar-section').first()
    const initialHeight = await fileTreeSection.evaluate((el) => el.getBoundingClientRect().height)

    // Drag the divider up by 60px — this shrinks session-list and grows fileTree
    const dividerBox = await divider.boundingBox()
    if (dividerBox) {
      await mainWindow.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2)
      await mainWindow.mouse.down()
      await mainWindow.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2 - 60, { steps: 10 })
      await mainWindow.mouse.up()
    }

    // fileTree section height should have increased (session-list shrunk, fileTree grew)
    const newHeight = await fileTreeSection.evaluate((el) => el.getBoundingClientRect().height)
    expect(newHeight).toBeGreaterThan(initialHeight)
  })

  test('sidebar position toggle left/right', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const appLayout = mainWindow.locator('.app-layout')

    // Open settings modal via the gear button
    const settingsBtn = mainWindow.locator('.sidebar-settings-btn[title*="Settings"]')
    await settingsBtn.click()

    const settingsModal = mainWindow.locator('.settings-modal')
    await expect(settingsModal).toBeVisible({ timeout: 5000 })

    // First ensure sidebar is on the left
    const leftBtn = settingsModal.locator('.settings-option-btn', { hasText: 'Left' })
    await leftBtn.click()
    await mainWindow.waitForTimeout(300)

    const leftFlexDir = await appLayout.evaluate((el) => getComputedStyle(el).flexDirection)
    expect(leftFlexDir).toBe('row')

    // Now toggle to right
    const rightBtn = settingsModal.locator('.settings-option-btn', { hasText: 'Right' })
    await rightBtn.click()
    await mainWindow.waitForTimeout(300)

    const rightFlexDir = await appLayout.evaluate((el) => getComputedStyle(el).flexDirection)
    expect(rightFlexDir).toBe('row-reverse')

    // Toggle back to left
    await leftBtn.click()
    await mainWindow.waitForTimeout(300)

    const restoredFlexDir = await appLayout.evaluate((el) => getComputedStyle(el).flexDirection)
    expect(restoredFlexDir).toBe('row')

    // Close settings
    await mainWindow.keyboard.press('Escape')
    await expect(settingsModal).toBeHidden({ timeout: 3000 })
  })
})
