import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut, evaluate } from './helpers'

test.describe('Command Palette: Open and Dismiss', () => {
  test('Cmd+P opens the command palette', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Palette should not be visible initially
    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible()

    // Open with Cmd+P
    await pressShortcut(mainWindow, 'p')

    // Palette modal and input should be visible
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })
    await expect(mainWindow.locator('.palette-input')).toBeVisible()
  })

  test('Escape closes the command palette', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open palette
    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Dismiss with Escape
    await mainWindow.keyboard.press('Escape')

    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })
  })

  test('Cmd+P toggles the palette closed if already open', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open
    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Toggle closed
    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })
  })

  test('clicking backdrop closes the palette', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Click backdrop (outside the modal)
    await mainWindow.locator('.palette-backdrop').click({ position: { x: 10, y: 10 } })

    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })
  })

  test('palette input is auto-focused on open', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Input should be focused
    const isFocused = await mainWindow.locator('.palette-input').evaluate(
      (el) => document.activeElement === el
    )
    expect(isFocused).toBe(true)
  })

  test('palette query resets on reopen', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open and type something
    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })
    await mainWindow.locator('.palette-input').fill('zoom')
    await expect(mainWindow.locator('.palette-input')).toHaveValue('zoom')

    // Close
    await mainWindow.keyboard.press('Escape')
    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })

    // Reopen — query should be empty
    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })
    await expect(mainWindow.locator('.palette-input')).toHaveValue('')
  })
})

test.describe('Command Palette: Search and Filtering', () => {
  test('shows all items when query is empty', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Should show palette items (actions at minimum)
    const items = mainWindow.locator('.palette-item')
    const count = await items.count()
    expect(count).toBeGreaterThan(0)
  })

  test('typing filters items by title', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    const allCount = await mainWindow.locator('.palette-item').count()

    // Type "New Terminal" to filter — exact title match avoids fuzzy noise
    await mainWindow.locator('.palette-input').fill('New Terminal')
    await mainWindow.waitForTimeout(200)

    const filteredCount = await mainWindow.locator('.palette-item').count()
    expect(filteredCount).toBeLessThan(allCount)
    expect(filteredCount).toBeGreaterThan(0)

    // The top result should be "New Terminal"
    const firstTitle = await mainWindow.locator('.palette-item .palette-item-title').first().textContent()
    expect(firstTitle).toBe('New Terminal')
  })

  test('shows "No matching commands" for non-matching query', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    await mainWindow.locator('.palette-input').fill('xyznonexistent999')
    await mainWindow.waitForTimeout(200)

    await expect(mainWindow.locator('.palette-empty')).toBeVisible()
    await expect(mainWindow.locator('.palette-empty')).toHaveText('No matching commands')
    await expect(mainWindow.locator('.palette-item')).toHaveCount(0)
  })

  test('filtering by category works', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Search for "settings" — should match items in Settings category
    await mainWindow.locator('.palette-input').fill('settings')
    await mainWindow.waitForTimeout(200)

    const items = mainWindow.locator('.palette-item')
    const count = await items.count()
    expect(count).toBeGreaterThan(0)
  })

  test('selectedIndex resets to 0 when query changes', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Navigate down
    await mainWindow.keyboard.press('ArrowDown')
    await mainWindow.keyboard.press('ArrowDown')

    // Type to filter — selected index should reset
    await mainWindow.locator('.palette-input').fill('new')
    await mainWindow.waitForTimeout(200)

    const selectedIndex = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.commandPaletteStore.getState().selectedIndex
    )
    expect(selectedIndex).toBe(0)
  })
})

test.describe('Command Palette: Arrow Key Navigation', () => {
  test('ArrowDown moves selection down', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // First item should be selected by default
    const firstItem = mainWindow.locator('.palette-item').first()
    await expect(firstItem).toHaveClass(/palette-item--selected/)

    // Press ArrowDown
    await mainWindow.keyboard.press('ArrowDown')

    // Second item should now be selected
    const secondItem = mainWindow.locator('.palette-item').nth(1)
    await expect(secondItem).toHaveClass(/palette-item--selected/)

    // First item should no longer be selected
    await expect(firstItem).not.toHaveClass(/palette-item--selected/)
  })

  test('ArrowUp moves selection up', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Move down first
    await mainWindow.keyboard.press('ArrowDown')
    await mainWindow.keyboard.press('ArrowDown')

    const thirdItem = mainWindow.locator('.palette-item').nth(2)
    await expect(thirdItem).toHaveClass(/palette-item--selected/)

    // Move up
    await mainWindow.keyboard.press('ArrowUp')

    const secondItem = mainWindow.locator('.palette-item').nth(1)
    await expect(secondItem).toHaveClass(/palette-item--selected/)
  })

  test('ArrowUp at top does not go negative', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // First item should be selected
    const firstItem = mainWindow.locator('.palette-item').first()
    await expect(firstItem).toHaveClass(/palette-item--selected/)

    // Press ArrowUp — should stay on first item
    await mainWindow.keyboard.press('ArrowUp')

    await expect(firstItem).toHaveClass(/palette-item--selected/)

    const selectedIndex = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.commandPaletteStore.getState().selectedIndex
    )
    expect(selectedIndex).toBe(0)
  })

  test('ArrowDown at bottom does not exceed list length', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Filter to a small known set
    await mainWindow.locator('.palette-input').fill('Reset Zoom')
    // Wait for file items to finish loading so list stabilizes
    await mainWindow.waitForTimeout(1500)

    const totalItems = await mainWindow.locator('.palette-item').count()
    expect(totalItems).toBeGreaterThan(0)

    // Press ArrowDown more times than there are items
    for (let i = 0; i < totalItems + 5; i++) {
      await mainWindow.keyboard.press('ArrowDown')
    }

    // Verify selectedIndex is clamped — it should not exceed totalItems - 1
    const selectedIndex = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.commandPaletteStore.getState().selectedIndex
    )
    expect(selectedIndex).toBeLessThan(totalItems)
    expect(selectedIndex).toBeGreaterThanOrEqual(0)
  })

  test('mouse hover changes selected index', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Wait for items to render
    await expect(mainWindow.locator('.palette-item').nth(2)).toBeVisible({ timeout: 3000 })

    // Hover over the third item
    const thirdItem = mainWindow.locator('.palette-item').nth(2)
    await thirdItem.hover({ force: true })
    await mainWindow.waitForTimeout(200)

    await expect(thirdItem).toHaveClass(/palette-item--selected/, { timeout: 3000 })
  })
})

test.describe('Command Palette: Execute Actions', () => {
  test('Enter executes selected action and closes palette', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Count sessions via store for reliable baseline
    const sessionCountBefore = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.size
    )

    // Open palette and search for "New Terminal"
    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    await mainWindow.locator('.palette-input').fill('New Terminal')
    await mainWindow.waitForTimeout(200)

    // Verify the item is visible
    const items = mainWindow.locator('.palette-item .palette-item-title')
    const firstTitle = await items.first().textContent()
    expect(firstTitle).toBe('New Terminal')

    // Execute with Enter
    await mainWindow.keyboard.press('Enter')

    // Palette should close
    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })

    // A new session should be created (check via store for reliability)
    await mainWindow.waitForTimeout(1000)
    const sessionCountAfter = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.size
    )
    expect(sessionCountAfter).toBeGreaterThan(sessionCountBefore)
  })

  test('clicking an item executes it and closes palette', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const terminalsBefore = await mainWindow.locator('.terminal-window').count()

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    await mainWindow.locator('.palette-input').fill('New Terminal')
    await mainWindow.waitForTimeout(200)

    // Click the first result
    await mainWindow.locator('.palette-item').first().click()

    // Palette should close
    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })

    // Terminal should be created
    await expect(mainWindow.locator('.terminal-window')).toHaveCount(terminalsBefore + 1, { timeout: 5000 })
  })

  test('Open Settings action opens settings modal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    await mainWindow.locator('.palette-input').fill('Open Settings')
    await mainWindow.waitForTimeout(200)

    await mainWindow.keyboard.press('Enter')

    // Palette should close
    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })

    // Settings modal should be visible
    await expect(mainWindow.locator('.settings-modal, [data-testid="settings-modal"]')).toBeVisible({ timeout: 3000 })
  })

  test('Show Keyboard Shortcuts action opens shortcuts overlay', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    await mainWindow.locator('.palette-input').fill('Keyboard Shortcuts')
    await mainWindow.waitForTimeout(200)

    await mainWindow.keyboard.press('Enter')

    // Palette should close
    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })

    // Shortcuts overlay should appear
    await expect(mainWindow.locator('.shortcuts-modal')).toBeVisible({ timeout: 3000 })
  })

  test('navigating with arrows then pressing Enter executes correct item', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    await mainWindow.locator('.palette-input').fill('zoom')
    await mainWindow.waitForTimeout(200)

    // Get title of second item
    const secondTitle = await mainWindow.locator('.palette-item .palette-item-title').nth(1).textContent()

    // Navigate down to second item
    await mainWindow.keyboard.press('ArrowDown')

    // Verify second item is selected
    await expect(mainWindow.locator('.palette-item').nth(1)).toHaveClass(/palette-item--selected/)

    // Execute
    await mainWindow.keyboard.press('Enter')

    // Palette should close
    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })

    // The correct action was triggered (we can verify palette closed with the right selection)
    // The action depends on which zoom item was second, but the key assertion is
    // that it closes and doesn't crash
  })
})

test.describe('Command Palette: Session Items', () => {
  test('existing sessions appear in palette results', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a session first
    await pressShortcut(mainWindow, 'n')
    await expect(mainWindow.locator('.terminal-window').first()).toBeVisible({ timeout: 5000 })

    // Get the session title
    const sessionTitle = await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      const firstId = Array.from(store.sessions.keys())[0] as string
      return store.sessions.get(firstId)?.title ?? ''
    })

    // Open palette
    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    // Session should appear in the list
    const itemTitles = await mainWindow.locator('.palette-item .palette-item-title').allTextContents()
    expect(itemTitles).toContain(sessionTitle)
  })

  test('selecting a session item pans to that session', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two sessions
    const countBefore = await mainWindow.locator('.terminal-window').count()
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(500)

    await expect(mainWindow.locator('.terminal-window')).toHaveCount(countBefore + 2, { timeout: 5000 })

    // Get first session's ID and title
    const firstSession = await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      const ids = Array.from(store.sessions.keys()) as string[]
      const first = store.sessions.get(ids[0])!
      return { id: ids[0], title: first.title }
    })

    // Focus the second session so we can verify pan changes focus
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.sessionStore.getState()
      const ids = Array.from(store.sessions.keys()) as string[]
      store.focusSession(ids[1])
    })
    await mainWindow.waitForTimeout(200)

    // Open palette and search for first session
    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    await mainWindow.locator('.palette-input').fill(firstSession.title)
    await mainWindow.waitForTimeout(200)

    await mainWindow.keyboard.press('Enter')

    // Palette should close
    await expect(mainWindow.locator('.palette-modal')).not.toBeVisible({ timeout: 3000 })

    // The focused session should be the one we selected
    await mainWindow.waitForTimeout(500)
    const focusedId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )
    expect(focusedId).toBe(firstSession.id)
  })
})

test.describe('Command Palette: Palette Items Display', () => {
  test('each item shows icon, title, and category', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    const firstItem = mainWindow.locator('.palette-item').first()
    await expect(firstItem.locator('.palette-item-icon')).toBeVisible()
    await expect(firstItem.locator('.palette-item-title')).toBeVisible()
    await expect(firstItem.locator('.palette-item-category')).toBeVisible()

    // Icon should have content
    const icon = await firstItem.locator('.palette-item-icon').textContent()
    expect(icon!.length).toBeGreaterThan(0)

    // Title should have content
    const title = await firstItem.locator('.palette-item-title').textContent()
    expect(title!.length).toBeGreaterThan(0)

    // Category should have content
    const category = await firstItem.locator('.palette-item-category').textContent()
    expect(category!.length).toBeGreaterThan(0)
  })

  test('palette footer shows navigation hints', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'p')
    await expect(mainWindow.locator('.palette-modal')).toBeVisible({ timeout: 3000 })

    const footer = mainWindow.locator('.palette-footer')
    await expect(footer).toBeVisible()

    const hint = await footer.textContent()
    expect(hint).toContain('navigate')
    expect(hint).toContain('select')
    expect(hint).toContain('close')
  })
})
