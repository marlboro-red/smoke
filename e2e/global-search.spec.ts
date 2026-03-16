import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * Helper: create two note sessions with known content for searching.
 * Returns session IDs.
 */
async function setupSearchScene(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const stores = (window as any).__SMOKE_STORES__
    const ss = stores.sessionStore.getState()

    // Create notes with known content
    const note1 = ss.createNoteSession({ x: 100, y: 100 })
    ss.updateSession(note1.id, { content: 'Hello World\nfoo bar baz\nHello again' })

    const note2 = ss.createNoteSession({ x: 500, y: 100 })
    ss.updateSession(note2.id, { content: 'Another note\nfoo BAR uppercase\nnothing here' })

    ss.focusSession(note1.id)
    return { id1: note1.id, id2: note2.id }
  })
}

test.describe('Global Search', () => {
  test('open and close search modal with Cmd+Shift+F', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Search should be closed initially
    const backdropBefore = await mainWindow.locator('.search-backdrop').count()
    expect(backdropBefore).toBe(0)

    // Open with shortcut
    await pressShortcut(mainWindow, 'f', { shift: true })
    const backdrop = mainWindow.locator('.search-backdrop')
    await expect(backdrop).toBeVisible({ timeout: 3000 })

    // Input should be focused
    const input = mainWindow.locator('.search-input')
    await expect(input).toBeFocused({ timeout: 2000 })

    // Close with Escape
    await mainWindow.keyboard.press('Escape')
    await expect(backdrop).not.toBeVisible({ timeout: 3000 })
  })

  test('close search by clicking backdrop', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const backdrop = mainWindow.locator('.search-backdrop')
    await expect(backdrop).toBeVisible({ timeout: 3000 })

    // Click the backdrop (not the modal)
    await backdrop.click({ position: { x: 10, y: 10 } })
    await expect(backdrop).not.toBeVisible({ timeout: 3000 })
  })

  test('toggle search open/closed with repeated shortcut', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open
    await pressShortcut(mainWindow, 'f', { shift: true })
    await expect(mainWindow.locator('.search-backdrop')).toBeVisible({ timeout: 3000 })

    // Toggle closed
    await pressShortcut(mainWindow, 'f', { shift: true })
    await expect(mainWindow.locator('.search-backdrop')).not.toBeVisible({ timeout: 3000 })
  })

  test('search across note sessions and display grouped results', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    // Open search
    await pressShortcut(mainWindow, 'f', { shift: true })
    await expect(mainWindow.locator('.search-backdrop')).toBeVisible({ timeout: 3000 })

    // Type a query that matches in both notes
    const input = mainWindow.locator('.search-input')
    await input.fill('foo')
    await mainWindow.waitForTimeout(500)

    // Should show results grouped by session
    const groups = mainWindow.locator('.search-group')
    await expect(groups).toHaveCount(2, { timeout: 3000 })

    // Each group should have a header with title and count
    const headers = mainWindow.locator('.search-group-header')
    await expect(headers).toHaveCount(2, { timeout: 3000 })

    // Total matches should be shown
    const count = mainWindow.locator('.search-count')
    await expect(count).toContainText('2 matches', { timeout: 3000 })
  })

  test('search results display match highlighting', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')
    await input.fill('Hello')
    await mainWindow.waitForTimeout(500)

    // Should have highlighted matches
    const highlights = mainWindow.locator('.search-highlight')
    const highlightCount = await highlights.count()
    expect(highlightCount).toBeGreaterThanOrEqual(2) // "Hello World" and "Hello again"

    // Verify the highlighted text is the match
    await expect(highlights.first()).toHaveText('Hello')
  })

  test('search shows "No matches found" for unmatched query', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')
    await input.fill('xyznonexistent')
    await mainWindow.waitForTimeout(500)

    const empty = mainWindow.locator('.search-empty')
    await expect(empty).toHaveText('No matches found', { timeout: 3000 })
  })

  test('search shows prompt text when query is empty', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    await expect(mainWindow.locator('.search-backdrop')).toBeVisible({ timeout: 3000 })

    const empty = mainWindow.locator('.search-empty')
    await expect(empty).toContainText('Type to search', { timeout: 3000 })
  })

  test('click result to pan to and focus the element', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    const ids = await setupSearchScene(mainWindow)

    // Focus note1 initially
    await mainWindow.evaluate((id) => {
      const stores = (window as any).__SMOKE_STORES__
      stores.sessionStore.getState().focusSession(id)
    }, ids.id1)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')
    await input.fill('BAR uppercase')
    await mainWindow.waitForTimeout(500)

    // Should have result from note2
    const resultRows = mainWindow.locator('.search-result-row')
    await expect(resultRows.first()).toBeVisible({ timeout: 3000 })

    // Click the result
    await resultRows.first().click()

    // Search modal should close
    await expect(mainWindow.locator('.search-backdrop')).not.toBeVisible({ timeout: 3000 })

    // note2 should be focused
    await mainWindow.waitForTimeout(500)
    const focusedId = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      return stores.sessionStore.getState().focusedId
    })
    expect(focusedId).toBe(ids.id2)
  })

  test('results show group icon matching session type', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')
    await input.fill('foo')
    await mainWindow.waitForTimeout(500)

    // Notes use '~' as type icon
    const icons = mainWindow.locator('.search-group-icon')
    const count = await icons.count()
    expect(count).toBeGreaterThanOrEqual(1)
    await expect(icons.first()).toHaveText('~')
  })

  test('case sensitivity toggle changes search results', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')
    await input.fill('bar')
    await mainWindow.waitForTimeout(500)

    // By default, case-insensitive: should match "bar" and "BAR"
    const countDefault = mainWindow.locator('.search-count')
    await expect(countDefault).toContainText('2 matches', { timeout: 3000 })

    // Toggle case sensitivity on
    const csBtn = mainWindow.locator('.search-toggle-btn', { hasText: 'Aa' })
    await csBtn.click()
    await mainWindow.waitForTimeout(500)

    // Button should be active
    await expect(csBtn).toHaveClass(/active/, { timeout: 2000 })

    // Now only lowercase "bar" should match (from note1: "foo bar baz")
    await expect(countDefault).toContainText('1 match', { timeout: 3000 })

    // Toggle off
    await csBtn.click()
    await mainWindow.waitForTimeout(500)
    await expect(csBtn).not.toHaveClass(/active/, { timeout: 2000 })
    await expect(countDefault).toContainText('2 matches', { timeout: 3000 })
  })

  test('regex mode toggle enables regex search', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')

    // Type a regex pattern (without regex mode it should search literally)
    await input.fill('Hello.*again')
    await mainWindow.waitForTimeout(500)

    // Literal search should find 0 matches
    const count = mainWindow.locator('.search-count')
    // "Hello.*again" as literal doesn't appear in any note
    const noResults = mainWindow.locator('.search-empty')
    await expect(noResults).toHaveText('No matches found', { timeout: 3000 })

    // Toggle regex mode on
    const regexBtn = mainWindow.locator('.search-toggle-btn', { hasText: '.*' })
    await regexBtn.click()
    await mainWindow.waitForTimeout(500)

    // Button should be active
    await expect(regexBtn).toHaveClass(/active/, { timeout: 2000 })

    // Regex won't match across lines (single line mode), so "Hello.*again" won't match either
    // Let's search for a pattern that does match within a single line
    await input.fill('fo+\\s+bar')
    await mainWindow.waitForTimeout(500)

    // Should match "foo bar" in note1 (and "foo BAR" in note2 since case-insensitive by default)
    await expect(count).toContainText('2 matches', { timeout: 3000 })

    // Toggle regex off
    await regexBtn.click()
    await mainWindow.waitForTimeout(500)
    await expect(regexBtn).not.toHaveClass(/active/, { timeout: 2000 })
  })

  test('regex with case sensitivity combined', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    // Reset toggles to known state before starting
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const state = stores.canvasSearchStore.getState()
      if (state.caseSensitive) state.toggleCaseSensitive()
      if (state.regex) state.toggleRegex()
    })

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')

    // Enable both regex and case sensitive
    const regexBtn = mainWindow.locator('.search-toggle-btn', { hasText: '.*' })
    const csBtn = mainWindow.locator('.search-toggle-btn', { hasText: 'Aa' })
    await csBtn.click()
    await regexBtn.click()
    await mainWindow.waitForTimeout(300)

    // Search for uppercase BAR with regex + case sensitive
    await input.fill('BAR')
    await mainWindow.waitForTimeout(500)

    // Only note2 has uppercase "BAR" — but other sessions (terminal) may also have text
    // Verify we get at least one result and the toggles are active
    await expect(csBtn).toHaveClass(/active/, { timeout: 2000 })
    await expect(regexBtn).toHaveClass(/active/, { timeout: 2000 })

    const count = mainWindow.locator('.search-count')
    await expect(count).toBeVisible({ timeout: 3000 })

    // Now compare: with case-insensitive, should get more matches
    await csBtn.click() // turn off case sensitive
    await mainWindow.waitForTimeout(500)

    const countText = await count.textContent()
    const matchCount = parseInt(countText || '0')
    // Case-insensitive "BAR" should match both "bar" and "BAR"
    expect(matchCount).toBeGreaterThanOrEqual(2)
  })

  test('search store state reflects toggles correctly', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Check initial store state
    const initial = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const state = stores.canvasSearchStore.getState()
      return { isOpen: state.isOpen, caseSensitive: state.caseSensitive, regex: state.regex }
    })
    expect(initial.isOpen).toBe(false)
    expect(initial.caseSensitive).toBe(false)
    expect(initial.regex).toBe(false)

    // Toggle via store
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      stores.canvasSearchStore.getState().toggleCaseSensitive()
      stores.canvasSearchStore.getState().toggleRegex()
    })

    const toggled = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const state = stores.canvasSearchStore.getState()
      return { caseSensitive: state.caseSensitive, regex: state.regex }
    })
    expect(toggled.caseSensitive).toBe(true)
    expect(toggled.regex).toBe(true)
  })

  test('result rows show line numbers', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')
    await input.fill('Hello')
    await mainWindow.waitForTimeout(500)

    // Should have result rows with line numbers
    const lineNums = mainWindow.locator('.search-result-line-num')
    const count = await lineNums.count()
    expect(count).toBeGreaterThanOrEqual(2)

    // "Hello World" is on line 1, "Hello again" is on line 3
    const nums = await lineNums.allTextContents()
    expect(nums).toContain('1')
    expect(nums).toContain('3')
  })

  test('group count badge shows correct match count per group', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')
    // Use a unique term that only appears in our test notes
    await input.fill('foo bar baz')
    await mainWindow.waitForTimeout(500)

    // Only note1 has "foo bar baz" (once), so one group with count 1
    const groups = mainWindow.locator('.search-group')
    await expect(groups).toHaveCount(1, { timeout: 3000 })

    const groupCount = mainWindow.locator('.search-group-count')
    await expect(groupCount.first()).toHaveText('1', { timeout: 3000 })
  })

  test('invalid regex does not crash and shows no results', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })

    // Enable regex mode
    const regexBtn = mainWindow.locator('.search-toggle-btn', { hasText: '.*' })
    await regexBtn.click()
    await mainWindow.waitForTimeout(300)

    const input = mainWindow.locator('.search-input')
    // Invalid regex pattern — unclosed group
    await input.fill('(unclosed')
    await mainWindow.waitForTimeout(500)

    // Should not crash, should show no results
    const empty = mainWindow.locator('.search-empty')
    await expect(empty).toHaveText('No matches found', { timeout: 3000 })
  })

  test('closing search clears query and results', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupSearchScene(mainWindow)

    await pressShortcut(mainWindow, 'f', { shift: true })
    const input = mainWindow.locator('.search-input')
    await input.fill('foo')
    await mainWindow.waitForTimeout(500)

    // Verify results exist
    const groups = mainWindow.locator('.search-group')
    await expect(groups).toHaveCount(2, { timeout: 3000 })

    // Close
    await mainWindow.keyboard.press('Escape')
    await expect(mainWindow.locator('.search-backdrop')).not.toBeVisible({ timeout: 3000 })

    // Reopen — should be empty
    await pressShortcut(mainWindow, 'f', { shift: true })
    await expect(input).toHaveValue('', { timeout: 2000 })

    const emptyMsg = mainWindow.locator('.search-empty')
    await expect(emptyMsg).toContainText('Type to search', { timeout: 3000 })
  })
})
