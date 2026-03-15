import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'

test.describe('Sticky Notes', () => {
  test('create a sticky note via sidebar button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const noteBtn = mainWindow.locator('.sidebar-new-btn', { hasText: 'Note' })
    await noteBtn.click()

    const noteWindow = mainWindow.locator('.note-window')
    await expect(noteWindow.first()).toBeVisible({ timeout: 5000 })

    // Note should appear in sidebar
    const sessionItems = mainWindow.locator('.session-list-item')
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 })
  })

  test('edit sticky note text', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const noteBtn = mainWindow.locator('.sidebar-new-btn', { hasText: 'Note' })
    await noteBtn.click()

    const noteWindow = mainWindow.locator('.note-window')
    await expect(noteWindow.first()).toBeVisible({ timeout: 5000 })

    const textarea = noteWindow.first().locator('.note-textarea')
    await expect(textarea).toBeVisible()

    await textarea.click()
    await textarea.fill('Hello from E2E test!')

    // Verify the textarea value was updated
    await expect(textarea).toHaveValue('Hello from E2E test!')
  })

  test('change sticky note color', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const noteBtn = mainWindow.locator('.sidebar-new-btn', { hasText: 'Note' })
    await noteBtn.click()

    const noteWindow = mainWindow.locator('.note-window')
    await expect(noteWindow.first()).toBeVisible({ timeout: 5000 })

    // Open the color picker
    const colorBtn = noteWindow.first().locator('.note-color-btn')
    await colorBtn.click()

    const popover = mainWindow.locator('.note-color-popover')
    await expect(popover).toBeVisible()

    // Click the "blue" preset (third preset)
    const bluePreset = popover.locator('.note-color-preset').nth(2)
    await bluePreset.click()

    // Popover should close after selection
    await expect(popover).not.toBeVisible()

    // Verify the note's background color changed via store
    const color = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const sessions = stores.sessionStore.getState().sessions
      for (const s of sessions.values()) {
        if (s.type === 'note') return s.color
      }
      return null
    })
    expect(color).toBe('blue')
  })

  test('delete a sticky note via close button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const noteBtn = mainWindow.locator('.sidebar-new-btn', { hasText: 'Note' })
    await noteBtn.click()

    const noteWindow = mainWindow.locator('.note-window')
    await expect(noteWindow.first()).toBeVisible({ timeout: 5000 })

    const countBefore = await noteWindow.count()

    // Close via X button
    const closeBtn = noteWindow.first().locator('.window-chrome-close')
    await closeBtn.click({ force: true })

    await expect(noteWindow).toHaveCount(countBefore - 1, { timeout: 5000 })
  })
})

test.describe('Arrow Connectors', () => {
  test('create an arrow between two notes and verify it renders', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two notes programmatically with known positions
    const sessionIds = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const store = stores.sessionStore.getState()
      const note1 = store.createNoteSession({ x: 100, y: 100 })
      const note2 = store.createNoteSession({ x: 500, y: 100 })
      return { id1: note1.id, id2: note2.id }
    })

    // Wait for notes to render
    const noteWindows = mainWindow.locator('.note-window')
    await expect(noteWindows).toHaveCount(2, { timeout: 5000 })

    // Create a connector between them
    await mainWindow.evaluate(([id1, id2]) => {
      const stores = (window as any).__SMOKE_STORES__
      stores.connectorStore.getState().addConnector(id1, id2, {
        label: 'test arrow',
        color: '#ff0000',
      })
    }, [sessionIds.id1, sessionIds.id2])

    // Verify the SVG connector layer renders with a path
    const connectorPath = mainWindow.locator('svg path[stroke="#ff0000"]')
    await expect(connectorPath).toBeVisible({ timeout: 5000 })

    // Verify the label renders
    const connectorLabel = mainWindow.locator('svg text', { hasText: 'test arrow' })
    await expect(connectorLabel).toBeVisible()
  })

  test('arrow updates when element moves', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two notes
    const sessionIds = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const store = stores.sessionStore.getState()
      const note1 = store.createNoteSession({ x: 100, y: 100 })
      const note2 = store.createNoteSession({ x: 500, y: 100 })
      return { id1: note1.id, id2: note2.id }
    })

    await mainWindow.locator('.note-window')
    const noteWindows = mainWindow.locator('.note-window')
    await expect(noteWindows).toHaveCount(2, { timeout: 5000 })

    // Add a connector
    await mainWindow.evaluate(([id1, id2]) => {
      const stores = (window as any).__SMOKE_STORES__
      stores.connectorStore.getState().addConnector(id1, id2, { color: '#00ff00' })
    }, [sessionIds.id1, sessionIds.id2])

    const connectorPath = mainWindow.locator('svg path[stroke="#00ff00"]')
    await expect(connectorPath).toBeVisible({ timeout: 5000 })

    // Capture the original path data
    const pathBefore = await connectorPath.getAttribute('d')

    // Move the first note to a new position
    await mainWindow.evaluate((id) => {
      const stores = (window as any).__SMOKE_STORES__
      stores.sessionStore.getState().updateSession(id, {
        position: { x: 100, y: 400 },
      })
    }, sessionIds.id1)

    // Wait for re-render
    await mainWindow.waitForTimeout(300)

    // Verify the path data changed
    const pathAfter = await connectorPath.getAttribute('d')
    expect(pathAfter).not.toBe(pathBefore)
  })

  test('delete an arrow', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two notes and a connector
    const ids = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const store = stores.sessionStore.getState()
      const note1 = store.createNoteSession({ x: 100, y: 100 })
      const note2 = store.createNoteSession({ x: 500, y: 100 })
      const connector = stores.connectorStore.getState().addConnector(
        note1.id, note2.id, { color: '#0000ff' }
      )
      return { connectorId: connector.id }
    })

    const connectorPath = mainWindow.locator('svg path[stroke="#0000ff"]')
    await expect(connectorPath).toBeVisible({ timeout: 5000 })

    // Delete the connector
    await mainWindow.evaluate((connId) => {
      const stores = (window as any).__SMOKE_STORES__
      stores.connectorStore.getState().removeConnector(connId)
    }, ids.connectorId)

    // Verify the path is gone
    await expect(connectorPath).not.toBeVisible({ timeout: 5000 })
  })

  test('connectors cleaned up when note is deleted', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create two notes and a connector
    const ids = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const store = stores.sessionStore.getState()
      const note1 = store.createNoteSession({ x: 100, y: 100 })
      const note2 = store.createNoteSession({ x: 500, y: 100 })
      stores.connectorStore.getState().addConnector(
        note1.id, note2.id, { color: '#ff00ff' }
      )
      return { noteId: note1.id }
    })

    const connectorPath = mainWindow.locator('svg path[stroke="#ff00ff"]')
    await expect(connectorPath).toBeVisible({ timeout: 5000 })

    // Delete the first note — connector should disappear
    await mainWindow.evaluate((noteId) => {
      const stores = (window as any).__SMOKE_STORES__
      stores.sessionStore.getState().removeSession(noteId)
    }, ids.noteId)

    await expect(connectorPath).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('Notes and Connectors Persistence', () => {
  test('sticky notes persist across layout save/load', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a note with specific content and color
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const store = stores.sessionStore.getState()
      const note = store.createNoteSession({ x: 200, y: 200 }, 'pink')
      store.updateSession(note.id, {
        title: 'Persistent Note',
        content: 'This should survive save/load',
      })
    })

    const noteWindow = mainWindow.locator('.note-window')
    await expect(noteWindow.first()).toBeVisible({ timeout: 5000 })

    // Save layout
    await mainWindow.evaluate(() => {
      return window.smokeAPI.layout.save('e2e-test-layout', {
        name: 'e2e-test-layout',
        sessions: [{
          type: 'note' as const,
          title: 'Persistent Note',
          cwd: '',
          content: 'This should survive save/load',
          color: 'pink',
          position: { x: 200, y: 200 },
          size: { width: 240, height: 200, cols: 0, rows: 0 },
        }],
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      })
    })

    // Clear all sessions
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const sessions = stores.sessionStore.getState().sessions
      for (const id of sessions.keys()) {
        stores.sessionStore.getState().removeSession(id)
      }
    })

    await expect(noteWindow).toHaveCount(0, { timeout: 5000 })

    // Load the saved layout
    await mainWindow.evaluate(async () => {
      const layout = await window.smokeAPI.layout.load('e2e-test-layout')
      if (!layout) throw new Error('Layout not found')

      // Restore note sessions from the layout
      for (const saved of layout.sessions) {
        if (saved.type === 'note') {
          const stores = (window as any).__SMOKE_STORES__
          const store = stores.sessionStore.getState()
          const session = store.createNoteSession(saved.position, saved.color)
          store.updateSession(session.id, {
            title: saved.title,
            content: saved.content ?? '',
            size: saved.size,
          })
        }
      }
    })

    // Verify the note was restored
    await expect(noteWindow).toHaveCount(1, { timeout: 5000 })

    // Verify content
    const textarea = noteWindow.first().locator('.note-textarea')
    await expect(textarea).toHaveValue('This should survive save/load')

    // Verify color was restored
    const color = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const sessions = stores.sessionStore.getState().sessions
      for (const s of sessions.values()) {
        if (s.type === 'note') return s.color
      }
      return null
    })
    expect(color).toBe('pink')

    // Cleanup: delete the test layout
    await mainWindow.evaluate(() => window.smokeAPI.layout.delete('e2e-test-layout'))
  })
})
