import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * Helper: remove all sessions via the store (avoids UI close-button issues).
 */
async function removeAllSessions(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as any).__SMOKE_STORES__?.sessionStore
    if (!store) return
    const ids = Array.from(store.getState().sessions.keys()) as string[]
    for (const id of ids) {
      store.getState().removeSession(id)
    }
  })
  await page.waitForTimeout(500)
}

/**
 * Helper: create a terminal at a specific canvas position via the store.
 * Returns the session ID.
 */
async function createTerminalAt(
  page: import('@playwright/test').Page,
  x: number,
  y: number
): Promise<string> {
  const sessionId = await page.evaluate(({ x, y }) => {
    const store = (window as any).__SMOKE_STORES__?.sessionStore
    const session = store.getState().createSession(process.cwd(), { x, y })
    return session.id
  }, { x, y })
  await page.waitForTimeout(500)
  return sessionId
}

/**
 * Helper: get the selectedIds set from the session store.
 */
async function getSelectedIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = (window as any).__SMOKE_STORES__?.sessionStore
    if (!store) return []
    return Array.from(store.getState().selectedIds) as string[]
  })
}

/**
 * Helper: set selectedIds directly via the store.
 */
async function setSelectedIds(page: import('@playwright/test').Page, ids: string[]): Promise<void> {
  await page.evaluate((ids) => {
    const store = (window as any).__SMOKE_STORES__?.sessionStore
    store.getState().setSelectedIds(new Set(ids))
  }, ids)
  await page.waitForTimeout(200)
}

/**
 * Helper: get the position of a session from the store.
 */
async function getSessionPosition(
  page: import('@playwright/test').Page,
  sessionId: string
): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    const store = (window as any).__SMOKE_STORES__?.sessionStore
    const session = store.getState().sessions.get(id)
    return { x: session.position.x, y: session.position.y }
  }, sessionId)
}

/**
 * Helper: perform a rubber band drag using dispatchEvent to avoid
 * the synthetic click event that Playwright's mouse API generates.
 * The Canvas onClick handler calls clearSelection(), which would wipe
 * the rubber band selection if a click event fires after mouseup.
 *
 * Coordinates are relative to the canvas-root element.
 */
async function rubberBandDrag(
  page: import('@playwright/test').Page,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  options?: { shift?: boolean }
): Promise<void> {
  await page.evaluate(({ startX, startY, endX, endY, shift }) => {
    const canvas = document.querySelector('.canvas-root') as HTMLElement
    const rect = canvas.getBoundingClientRect()
    const absStartX = rect.left + startX
    const absStartY = rect.top + startY
    const absEndX = rect.left + endX
    const absEndY = rect.top + endY

    // Dispatch pointerdown on canvas root
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: absStartX,
      clientY: absStartY,
      button: 0,
      pointerId: 99,
      bubbles: true,
      composed: true,
      shiftKey: !!shift,
    }))

    // Move in steps to pass the drag threshold (5px) and populate selection
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = absStartX + (absEndX - absStartX) * t
      const y = absStartY + (absEndY - absStartY) * t
      document.dispatchEvent(new PointerEvent('pointermove', {
        clientX: x,
        clientY: y,
        pointerId: 99,
        bubbles: true,
        composed: true,
        shiftKey: !!shift,
      }))
    }

    // Dispatch pointerup — no click event follows
    document.dispatchEvent(new PointerEvent('pointerup', {
      clientX: absEndX,
      clientY: absEndY,
      button: 0,
      pointerId: 99,
      bubbles: true,
      composed: true,
    }))
  }, { startX, startY, endX, endY, shift: options?.shift ?? false })

  await page.waitForTimeout(300)
}

test.describe('Rubber Band Multi-Select and Alignment Tools', () => {
  test.describe('Rubber band selection', () => {
    test('click-drag on empty canvas selects elements within the rectangle', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      // Create two terminals at known positions via store
      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 800, 100)

      // Clear any existing selection
      await mainWindow.evaluate(() => {
        const store = (window as any).__SMOKE_STORES__?.sessionStore
        store.getState().clearSelection()
      })

      let selected = await getSelectedIds(mainWindow)
      expect(selected.length).toBe(0)

      // Rubber band drag encompassing both terminals (they are 640x480 each)
      // id1: (100,100)-(740,580), id2: (800,100)-(1440,580)
      // Drag from (50,50) to (1500,600)
      await rubberBandDrag(mainWindow, 50, 50, 1500, 600)

      selected = await getSelectedIds(mainWindow)
      expect(selected.length).toBe(2)
      expect(selected).toContain(id1)
      expect(selected).toContain(id2)
    })

    test('rubber band overlay appears during drag and is removed after', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const canvas = mainWindow.locator('.canvas-root')
      const box = await canvas.boundingBox()
      expect(box).toBeTruthy()

      // Start a drag on empty canvas using real mouse (so we can check mid-drag)
      await mainWindow.mouse.move(box!.x + 50, box!.y + 50)
      await mainWindow.mouse.down()
      await mainWindow.mouse.move(box!.x + 300, box!.y + 300, { steps: 5 })

      // The rubber-band-overlay should be visible during drag
      const overlay = mainWindow.locator('.rubber-band-overlay')
      await expect(overlay).toBeVisible({ timeout: 2000 })

      // Canvas root should have rubber-band-active class
      await expect(canvas).toHaveClass(/rubber-band-active/)

      await mainWindow.mouse.up()
      await mainWindow.waitForTimeout(300)

      // Overlay should be removed after drag ends
      await expect(overlay).toHaveCount(0)
    })

    test('rubber band selects only overlapping elements', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      // Place terminals far apart
      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 2000, 100)

      await mainWindow.evaluate(() => {
        const store = (window as any).__SMOKE_STORES__?.sessionStore
        store.getState().clearSelection()
      })

      // Drag only over id1 area (100,100)-(740,580)
      await rubberBandDrag(mainWindow, 50, 50, 750, 600)

      const selected = await getSelectedIds(mainWindow)
      expect(selected).toContain(id1)
      expect(selected).not.toContain(id2)
    })

    test('selected elements get multi-selected CSS class', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 800, 100)

      await mainWindow.evaluate(() => {
        const store = (window as any).__SMOKE_STORES__?.sessionStore
        store.getState().clearSelection()
      })

      // Select both via rubber band
      await rubberBandDrag(mainWindow, 50, 50, 1500, 600)

      // Both windows should have the multi-selected class
      const window1 = mainWindow.locator(`[data-session-id="${id1}"]`)
      const window2 = mainWindow.locator(`[data-session-id="${id2}"]`)

      await expect(window1).toHaveClass(/multi-selected/, { timeout: 3000 })
      await expect(window2).toHaveClass(/multi-selected/, { timeout: 3000 })
    })
  })

  test.describe('Shift+click to add/remove from selection', () => {
    test('Shift+click adds to and removes from selection', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 800, 100)

      // Select id1 via store
      await setSelectedIds(mainWindow, [id1])

      let selected = await getSelectedIds(mainWindow)
      expect(selected).toContain(id1)
      expect(selected).not.toContain(id2)

      // Shift+click id2 to add to selection
      const window2 = mainWindow.locator(`[data-session-id="${id2}"]`)
      await window2.dispatchEvent('pointerdown', {
        bubbles: true,
        composed: true,
        shiftKey: true,
        pointerId: 1,
      })
      await mainWindow.waitForTimeout(300)

      selected = await getSelectedIds(mainWindow)
      expect(selected).toContain(id1)
      expect(selected).toContain(id2)

      // Shift+click id1 to remove it from selection
      const window1 = mainWindow.locator(`[data-session-id="${id1}"]`)
      await window1.dispatchEvent('pointerdown', {
        bubbles: true,
        composed: true,
        shiftKey: true,
        pointerId: 1,
      })
      await mainWindow.waitForTimeout(300)

      selected = await getSelectedIds(mainWindow)
      expect(selected).not.toContain(id1)
      expect(selected).toContain(id2)
    })
  })

  test.describe('Escape clears selection', () => {
    test('pressing Escape clears the current selection', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 800, 100)

      // Select both via store
      await setSelectedIds(mainWindow, [id1, id2])

      let selected = await getSelectedIds(mainWindow)
      expect(selected.length).toBe(2)

      // Press Escape
      await mainWindow.keyboard.press('Escape')
      await mainWindow.waitForTimeout(300)

      selected = await getSelectedIds(mainWindow)
      expect(selected.length).toBe(0)

      // multi-selected class should be removed
      const window1 = mainWindow.locator(`[data-session-id="${id1}"]`)
      await expect(window1).not.toHaveClass(/multi-selected/)
    })
  })

  test.describe('Alignment toolbar', () => {
    test('alignment toolbar appears when 2+ are selected and disappears on clear', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 800, 100)

      // No selection — toolbar should not exist
      const toolbar = mainWindow.locator('.alignment-toolbar')
      await expect(toolbar).toHaveCount(0)

      // Select both
      await setSelectedIds(mainWindow, [id1, id2])

      // Toolbar should appear with "2 selected" label
      await expect(toolbar).toBeVisible({ timeout: 3000 })
      const label = mainWindow.locator('.alignment-toolbar-label')
      await expect(label).toHaveText('2 selected')

      // Clear selection — toolbar should disappear
      await mainWindow.keyboard.press('Escape')
      await mainWindow.waitForTimeout(300)
      await expect(toolbar).toHaveCount(0)
    })

    test('toolbar has all 8 alignment buttons', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 800, 100)

      await setSelectedIds(mainWindow, [id1, id2])

      const toolbar = mainWindow.locator('.alignment-toolbar')
      await expect(toolbar).toBeVisible({ timeout: 3000 })

      const buttons = mainWindow.locator('.alignment-toolbar-btn')
      await expect(buttons).toHaveCount(8)

      const expectedTitles = [
        'Align left', 'Align center horizontally', 'Align right',
        'Align top', 'Align center vertically', 'Align bottom',
        'Distribute horizontally', 'Distribute vertically',
      ]
      for (const title of expectedTitles) {
        await expect(mainWindow.locator(`.alignment-toolbar-btn[title="${title}"]`)).toBeVisible()
      }
    })

    test('align left moves all selected to leftmost position', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 500, 100)

      const pos1Before = await getSessionPosition(mainWindow, id1)
      const pos2Before = await getSessionPosition(mainWindow, id2)
      expect(pos1Before.x).not.toBe(pos2Before.x)

      await setSelectedIds(mainWindow, [id1, id2])

      const btn = mainWindow.locator('.alignment-toolbar-btn[title="Align left"]')
      await expect(btn).toBeVisible({ timeout: 3000 })
      await btn.click()
      await mainWindow.waitForTimeout(300)

      const pos1After = await getSessionPosition(mainWindow, id1)
      const pos2After = await getSessionPosition(mainWindow, id2)
      const minX = Math.min(pos1Before.x, pos2Before.x)
      expect(pos1After.x).toBe(minX)
      expect(pos2After.x).toBe(minX)
    })

    test('align right moves all selected to rightmost edge', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 500, 100)

      await setSelectedIds(mainWindow, [id1, id2])

      const btn = mainWindow.locator('.alignment-toolbar-btn[title="Align right"]')
      await expect(btn).toBeVisible({ timeout: 3000 })
      await btn.click()
      await mainWindow.waitForTimeout(300)

      // After align-right, both should have the same X (since they have the same width)
      const pos1 = await getSessionPosition(mainWindow, id1)
      const pos2 = await getSessionPosition(mainWindow, id2)
      expect(pos1.x).toBe(pos2.x)
    })

    test('align top moves all selected to topmost position', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 100, 500)

      const pos1Before = await getSessionPosition(mainWindow, id1)
      const pos2Before = await getSessionPosition(mainWindow, id2)
      expect(pos1Before.y).not.toBe(pos2Before.y)

      await setSelectedIds(mainWindow, [id1, id2])

      const btn = mainWindow.locator('.alignment-toolbar-btn[title="Align top"]')
      await expect(btn).toBeVisible({ timeout: 3000 })
      await btn.click()
      await mainWindow.waitForTimeout(300)

      const pos1After = await getSessionPosition(mainWindow, id1)
      const pos2After = await getSessionPosition(mainWindow, id2)
      const minY = Math.min(pos1Before.y, pos2Before.y)
      expect(pos1After.y).toBe(minY)
      expect(pos2After.y).toBe(minY)
    })

    test('align bottom moves all selected to bottommost edge', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 100, 500)

      await setSelectedIds(mainWindow, [id1, id2])

      const btn = mainWindow.locator('.alignment-toolbar-btn[title="Align bottom"]')
      await expect(btn).toBeVisible({ timeout: 3000 })
      await btn.click()
      await mainWindow.waitForTimeout(300)

      const pos1After = await getSessionPosition(mainWindow, id1)
      const pos2After = await getSessionPosition(mainWindow, id2)
      expect(pos1After.y).toBe(pos2After.y)
    })

    test('align center horizontally centers all selected', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 500, 100)

      await setSelectedIds(mainWindow, [id1, id2])

      const btn = mainWindow.locator('.alignment-toolbar-btn[title="Align center horizontally"]')
      await expect(btn).toBeVisible({ timeout: 3000 })
      await btn.click()
      await mainWindow.waitForTimeout(300)

      const pos1 = await getSessionPosition(mainWindow, id1)
      const pos2 = await getSessionPosition(mainWindow, id2)
      expect(pos1.x).toBe(pos2.x)
    })

    test('align center vertically centers all selected', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 100, 500)

      await setSelectedIds(mainWindow, [id1, id2])

      const btn = mainWindow.locator('.alignment-toolbar-btn[title="Align center vertically"]')
      await expect(btn).toBeVisible({ timeout: 3000 })
      await btn.click()
      await mainWindow.waitForTimeout(300)

      const pos1 = await getSessionPosition(mainWindow, id1)
      const pos2 = await getSessionPosition(mainWindow, id2)
      expect(pos1.y).toBe(pos2.y)
    })

    test('distribute horizontally spaces selected elements evenly', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 0, 100)
      const id2 = await createTerminalAt(mainWindow, 200, 100)
      const id3 = await createTerminalAt(mainWindow, 1500, 100)

      const pos2Before = await getSessionPosition(mainWindow, id2)

      await setSelectedIds(mainWindow, [id1, id2, id3])

      // Toolbar should show 3 selected
      const label = mainWindow.locator('.alignment-toolbar-label')
      await expect(label).toHaveText('3 selected', { timeout: 3000 })

      const btn = mainWindow.locator('.alignment-toolbar-btn[title="Distribute horizontally"]')
      await btn.click()
      await mainWindow.waitForTimeout(300)

      // After distribute, the middle element should have moved
      const pos2After = await getSessionPosition(mainWindow, id2)
      expect(pos2After.x).not.toBe(pos2Before.x)
    })

    test('distribute vertically spaces selected elements evenly', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 0)
      const id2 = await createTerminalAt(mainWindow, 100, 200)
      const id3 = await createTerminalAt(mainWindow, 100, 1500)

      const pos2Before = await getSessionPosition(mainWindow, id2)

      await setSelectedIds(mainWindow, [id1, id2, id3])

      const btn = mainWindow.locator('.alignment-toolbar-btn[title="Distribute vertically"]')
      await expect(btn).toBeVisible({ timeout: 3000 })
      await btn.click()
      await mainWindow.waitForTimeout(300)

      const pos2After = await getSessionPosition(mainWindow, id2)
      expect(pos2After.y).not.toBe(pos2Before.y)
    })
  })

  test.describe('Shift+rubber band additive selection', () => {
    test('Shift+rubber band adds to existing selection', async ({ mainWindow }) => {
      await waitForAppReady(mainWindow)
      await removeAllSessions(mainWindow)

      const id1 = await createTerminalAt(mainWindow, 100, 100)
      const id2 = await createTerminalAt(mainWindow, 2000, 100)

      await mainWindow.evaluate(() => {
        const store = (window as any).__SMOKE_STORES__?.sessionStore
        store.getState().clearSelection()
      })

      // First rubber band selects id1 only
      await rubberBandDrag(mainWindow, 50, 50, 750, 600)

      let selected = await getSelectedIds(mainWindow)
      expect(selected).toContain(id1)
      expect(selected).not.toContain(id2)

      // Shift+rubber band over id2 area to add it
      await rubberBandDrag(mainWindow, 1950, 50, 2700, 600, { shift: true })

      selected = await getSelectedIds(mainWindow)
      expect(selected).toContain(id1)
      expect(selected).toContain(id2)
    })
  })
})
