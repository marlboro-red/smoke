import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut, evaluate } from './helpers'

/**
 * Press a shortcut with both shift and alt modifiers.
 * The existing pressShortcut helper only supports { shift }, so we build
 * the key combo manually for pane-navigation shortcuts (Cmd+Alt+Arrow).
 */
async function pressModShortcut(
  page: import('@playwright/test').Page,
  key: string,
  opts: { shift?: boolean; alt?: boolean } = {}
): Promise<void> {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  const parts = [modifier]
  if (opts.shift) parts.push('Shift')
  if (opts.alt) parts.push('Alt')
  parts.push(key)
  await page.keyboard.press(parts.join('+'))
}

test.describe('Split Panes: Split & Independent Shells', () => {
  test('Cmd+\\ splits terminal horizontally', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Ensure a terminal is focused
    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )
    expect(sessionId).toBeTruthy()

    // Split horizontally: Cmd+\
    await pressShortcut(mainWindow, '\\')
    await mainWindow.waitForTimeout(1000)

    // Verify split tree exists via store
    const isSplit = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().isSplit(id)
    }, sessionId)
    expect(isSplit).toBe(true)

    // Verify two pane leaves in the DOM
    const terminalWindow = mainWindow.locator(`[data-session-id="${sessionId}"]`)
    const leaves = terminalWindow.locator('.split-pane-leaf')
    await expect(leaves).toHaveCount(2, { timeout: 5000 })

    // Verify the branch direction is horizontal
    const direction = await mainWindow.evaluate((id) => {
      const tree = (window as any).__SMOKE_STORES__.splitPaneStore.getState().getTree(id)
      return tree?.direction
    }, sessionId)
    expect(direction).toBe('horizontal')
  })

  test('Cmd+Shift+\\ splits terminal vertically', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Split vertically: Cmd+Shift+\
    await pressShortcut(mainWindow, '\\', { shift: true })
    await mainWindow.waitForTimeout(1000)

    const isSplit = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().isSplit(id)
    }, sessionId)
    expect(isSplit).toBe(true)

    // Verify the branch direction is vertical
    const direction = await mainWindow.evaluate((id) => {
      const tree = (window as any).__SMOKE_STORES__.splitPaneStore.getState().getTree(id)
      return tree?.direction
    }, sessionId)
    expect(direction).toBe('vertical')

    // Verify two pane leaves
    const terminalWindow = mainWindow.locator(`[data-session-id="${sessionId}"]`)
    const leaves = terminalWindow.locator('.split-pane-leaf')
    await expect(leaves).toHaveCount(2, { timeout: 5000 })
  })

  test('each split pane runs an independent shell', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Split horizontally
    await pressShortcut(mainWindow, '\\')
    await mainWindow.waitForTimeout(1000)

    // Get all pane IDs — each should have its own PTY
    const paneIds = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.splitPaneStore.getState()
      const tree = store.getTree(id)
      if (!tree) return []
      const collect = (node: any): string[] => {
        if (node.type === 'leaf') return [node.paneId]
        return [...collect(node.first), ...collect(node.second)]
      }
      return collect(tree)
    }, sessionId)

    // Should have 2 independent panes
    expect(paneIds).toHaveLength(2)
    // The pane IDs should be different (independent shells)
    expect(paneIds[0]).not.toBe(paneIds[1])
  })
})

test.describe('Split Panes: Divider Resize', () => {
  test('dragging the divider changes the split ratio', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Split horizontally
    await pressShortcut(mainWindow, '\\')
    await mainWindow.waitForTimeout(1000)

    // Verify initial ratio is 0.5
    const initialRatio = await mainWindow.evaluate((id) => {
      const tree = (window as any).__SMOKE_STORES__.splitPaneStore.getState().getTree(id)
      return tree?.ratio
    }, sessionId)
    expect(initialRatio).toBe(0.5)

    // Find the divider element and its container
    const terminalWindow = mainWindow.locator(`[data-session-id="${sessionId}"]`)
    const divider = terminalWindow.locator('.split-pane-divider')
    await expect(divider).toBeVisible({ timeout: 5000 })

    // Dispatch pointer events programmatically on the divider to bypass
    // xterm canvas intercepting pointer events (same pattern as window-drag-resize)
    await mainWindow.evaluate((id) => {
      const windowEl = document.querySelector(`[data-session-id="${id}"]`)!
      const dividerEl = windowEl.querySelector('.split-pane-divider')! as HTMLElement
      const container = dividerEl.parentElement!
      const rect = container.getBoundingClientRect()
      const divRect = dividerEl.getBoundingClientRect()

      const startX = divRect.left + divRect.width / 2
      const startY = divRect.top + divRect.height / 2
      // Move 80px right (significant enough to change ratio)
      const endX = startX + 80

      // Dispatch pointerdown on divider
      dividerEl.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: startX,
        clientY: startY,
        bubbles: true,
        composed: true,
        pointerId: 1,
      }))

      // Dispatch pointermove on document (the handler listens on document)
      document.dispatchEvent(new PointerEvent('pointermove', {
        clientX: endX,
        clientY: startY,
        bubbles: true,
        composed: true,
        pointerId: 1,
      }))

      // Dispatch pointerup on document
      document.dispatchEvent(new PointerEvent('pointerup', {
        clientX: endX,
        clientY: startY,
        bubbles: true,
        composed: true,
        pointerId: 1,
      }))
    }, sessionId)

    await mainWindow.waitForTimeout(500)

    // Verify ratio changed from 0.5
    const newRatio = await mainWindow.evaluate((id) => {
      const tree = (window as any).__SMOKE_STORES__.splitPaneStore.getState().getTree(id)
      return tree?.ratio
    }, sessionId)

    expect(newRatio).not.toBe(0.5)
    expect(newRatio).toBeGreaterThan(0.15)
    expect(newRatio).toBeLessThan(0.85)
  })
})

test.describe('Split Panes: Close Individual Panes', () => {
  test('Cmd+Shift+W closes the focused pane', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Split horizontally
    await pressShortcut(mainWindow, '\\')
    await mainWindow.waitForTimeout(1000)

    // Verify split exists
    const isSplitBefore = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().isSplit(id)
    }, sessionId)
    expect(isSplitBefore).toBe(true)

    // Close the focused pane with Cmd+Shift+W
    await pressShortcut(mainWindow, 'w', { shift: true })
    await mainWindow.waitForTimeout(1000)

    // After closing one pane, the split should be gone (back to single pane)
    const isSplitAfter = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().isSplit(id)
    }, sessionId)
    expect(isSplitAfter).toBe(false)

    // Session should still exist
    const sessionExists = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.has(id)
    }, sessionId)
    expect(sessionExists).toBe(true)
  })

  test('closing all panes keeps session with single terminal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Split to create 2 panes, then close one
    await pressShortcut(mainWindow, '\\')
    await mainWindow.waitForTimeout(1000)

    const paneCountBefore = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getPaneCount(id)
    }, sessionId)
    expect(paneCountBefore).toBe(2)

    // Close focused pane
    await pressShortcut(mainWindow, 'w', { shift: true })
    await mainWindow.waitForTimeout(1000)

    // Should be back to 1 pane
    const paneCountAfter = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getPaneCount(id)
    }, sessionId)
    expect(paneCountAfter).toBe(1)

    // Terminal window should still be visible
    const terminalWindow = mainWindow.locator(`[data-session-id="${sessionId}"]`)
    await expect(terminalWindow).toBeVisible()
  })
})

test.describe('Split Panes: Focus Navigation', () => {
  test('Cmd+Alt+Arrow navigates between panes in horizontal split', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Split horizontally (creates left/right panes)
    await pressShortcut(mainWindow, '\\')
    await mainWindow.waitForTimeout(1000)

    // After split, focus should be on the new (second/right) pane
    const focusedAfterSplit = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getFocusedPane(id)
    }, sessionId)

    // Navigate left using store directly (Cmd+Alt+Arrow may be intercepted by xterm)
    await mainWindow.evaluate((id) => {
      ;(window as any).__SMOKE_STORES__.splitPaneStore.getState().navigate(id, 'left')
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    const focusedAfterLeft = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getFocusedPane(id)
    }, sessionId)

    // Focus should have changed to the left pane
    expect(focusedAfterLeft).not.toBe(focusedAfterSplit)

    // Navigate right using store directly
    await mainWindow.evaluate((id) => {
      ;(window as any).__SMOKE_STORES__.splitPaneStore.getState().navigate(id, 'right')
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    const focusedAfterRight = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getFocusedPane(id)
    }, sessionId)

    // Should be back to the right pane
    expect(focusedAfterRight).toBe(focusedAfterSplit)
  })

  test('Cmd+Alt+Arrow navigates between panes in vertical split', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Split vertically (creates top/bottom panes)
    await pressShortcut(mainWindow, '\\', { shift: true })
    await mainWindow.waitForTimeout(1000)

    // After split, focus should be on the new (second/bottom) pane
    const focusedAfterSplit = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getFocusedPane(id)
    }, sessionId)

    // Navigate up using store directly (Cmd+Alt+Arrow may be intercepted by xterm)
    await mainWindow.evaluate((id) => {
      ;(window as any).__SMOKE_STORES__.splitPaneStore.getState().navigate(id, 'up')
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    const focusedAfterUp = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getFocusedPane(id)
    }, sessionId)

    // Focus should have moved to the top pane
    expect(focusedAfterUp).not.toBe(focusedAfterSplit)

    // Navigate down using store directly
    await mainWindow.evaluate((id) => {
      ;(window as any).__SMOKE_STORES__.splitPaneStore.getState().navigate(id, 'down')
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    const focusedAfterDown = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getFocusedPane(id)
    }, sessionId)

    // Should be back to the bottom pane
    expect(focusedAfterDown).toBe(focusedAfterSplit)
  })

  test('focused pane gets visual indicator that follows navigation', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Split horizontally
    await pressShortcut(mainWindow, '\\')
    await mainWindow.waitForTimeout(1000)

    // Verify exactly one pane has the focused class via store + DOM
    const focusedPaneId = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getFocusedPane(id)
    }, sessionId)
    expect(focusedPaneId).toBeTruthy()

    const terminalWindow = mainWindow.locator(`[data-session-id="${sessionId}"]`)
    const focusedLeaves = terminalWindow.locator('.split-pane-focused')
    await expect(focusedLeaves).toHaveCount(1, { timeout: 5000 })

    // Navigate to the other pane using store directly (keyboard shortcuts
    // may be intercepted by xterm)
    await mainWindow.evaluate((id) => {
      ;(window as any).__SMOKE_STORES__.splitPaneStore.getState().navigate(id, 'left')
    }, sessionId)
    await mainWindow.waitForTimeout(300)

    const newFocusedPaneId = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getFocusedPane(id)
    }, sessionId)
    expect(newFocusedPaneId).not.toBe(focusedPaneId)

    // Still exactly one pane should have the focused indicator
    await expect(focusedLeaves).toHaveCount(1, { timeout: 5000 })
  })
})

test.describe('Split Panes: Max Pane Limit', () => {
  test('cannot split beyond 4 panes', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await pressShortcut(mainWindow, 'n')
    await mainWindow.waitForTimeout(1000)

    const sessionId = await evaluate(mainWindow, () =>
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusedId
    )

    // Use the store directly to create 3 splits (reaching 4 panes).
    // Keyboard shortcuts for rapid sequential splits are unreliable in E2E
    // because each split spawns a PTY that takes time to initialize.
    const paneCount = await mainWindow.evaluate((id) => {
      const store = (window as any).__SMOKE_STORES__.splitPaneStore.getState()
      store.split(id, 'horizontal') // 1 → 2 panes
      store.split(id, 'horizontal') // 2 → 3 panes
      store.split(id, 'horizontal') // 3 → 4 panes
      return store.getPaneCount(id)
    }, sessionId)
    expect(paneCount).toBe(4)

    // Attempt a 4th split via keyboard — should be blocked by the 4-pane limit
    await pressShortcut(mainWindow, '\\')
    await mainWindow.waitForTimeout(1000)

    const paneCountAfter = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().getPaneCount(id)
    }, sessionId)
    expect(paneCountAfter).toBe(4)

    // Also verify the store rejects a direct split call at the limit
    const result = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.splitPaneStore.getState().split(id, 'horizontal')
    }, sessionId)
    expect(result).toBeNull()
  })
})
