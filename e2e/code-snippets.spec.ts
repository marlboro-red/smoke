import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * Helper: read position, size, and zIndex from the DOM style of a session window.
 */
async function getWindowStyle(
  page: import('@playwright/test').Page,
  sessionId: string
): Promise<{ left: number; top: number; width: number; height: number; zIndex: number }> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"]`) as HTMLElement
    const style = el.style
    return {
      left: parseFloat(style.left) || 0,
      top: parseFloat(style.top) || 0,
      width: parseFloat(style.width) || 0,
      height: parseFloat(style.height) || 0,
      zIndex: parseInt(style.zIndex, 10) || 0,
    }
  }, sessionId)
}

/**
 * Helper: initiate a resize on a snippet window's handle.
 * Disables pointer-events on the snippet body so the handle is clickable.
 */
async function startResize(
  page: import('@playwright/test').Page,
  sessionId: string,
  direction: 'e' | 's' | 'se'
): Promise<{ startX: number; startY: number }> {
  const pos = await page.evaluate(([id, dir]) => {
    const windowEl = document.querySelector(`[data-session-id="${id}"]`)!
    const handle = windowEl.querySelector(`.resize-handle-${dir}`)!
    const rect = handle.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }, [sessionId, direction] as const)

  await page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"] .snippet-body`) as HTMLElement
    if (el) el.style.pointerEvents = 'none'
  }, sessionId)

  await page.mouse.move(pos.x, pos.y)
  await page.mouse.down()

  await page.evaluate((id) => {
    const el = document.querySelector(`[data-session-id="${id}"] .snippet-body`) as HTMLElement
    if (el) el.style.pointerEvents = ''
  }, sessionId)

  return { startX: pos.x, startY: pos.y }
}

/**
 * Helper: create a snippet via the store and return its session ID.
 */
async function createSnippet(
  page: import('@playwright/test').Page,
  options?: { language?: string; content?: string; position?: { x: number; y: number } }
): Promise<string> {
  const sessionId = await page.evaluate((opts) => {
    const stores = (window as any).__SMOKE_STORES__
    const store = stores.sessionStore.getState()
    const session = store.createSnippetSession(
      opts?.language,
      opts?.content,
      opts?.position ?? { x: 100, y: 80 }
    )
    store.focusSession(session.id)
    return session.id
  }, options ?? null)

  const snippetWindow = page.locator(`.snippet-window[data-session-id="${sessionId}"]`)
  await expect(snippetWindow).toBeVisible({ timeout: 5000 })
  return sessionId
}

/**
 * Helper: close all sessions via store.
 */
async function closeAllSessions(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const stores = (window as any).__SMOKE_STORES__
    const sessions = stores.sessionStore.getState().sessions
    for (const id of sessions.keys()) {
      stores.sessionStore.getState().removeSession(id)
    }
  })
  await page.waitForTimeout(300)
}

test.describe('Code Snippet Creation', () => {
  test('create a snippet via sidebar button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const snippetBtn = mainWindow.locator('.sidebar-new-btn', { hasText: 'Snippet' })
    await snippetBtn.click()

    const snippetWindow = mainWindow.locator('.snippet-window')
    await expect(snippetWindow.first()).toBeVisible({ timeout: 5000 })

    // Should appear in the sidebar session list
    const sessionItems = mainWindow.locator('.session-list-item')
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 })
  })

  test('create a snippet via keyboard shortcut (Cmd+Shift+K)', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    await pressShortcut(mainWindow, 'k', { shift: true })

    const snippetWindow = mainWindow.locator('.snippet-window')
    await expect(snippetWindow.first()).toBeVisible({ timeout: 5000 })
  })

  test('snippet has default language of javascript', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    await createSnippet(mainWindow)

    const langSelect = mainWindow.locator('.snippet-lang-select')
    await expect(langSelect.first()).toHaveValue('javascript')
  })
})

test.describe('Code Snippet Editing', () => {
  test('type code into snippet editor', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSnippet(mainWindow)

    // Click the CodeMirror editor area to focus it
    const cmContent = mainWindow.locator(
      `.snippet-window[data-session-id="${sessionId}"] .cm-content`
    )
    await expect(cmContent).toBeVisible({ timeout: 5000 })
    await cmContent.click()

    // Type some code
    await mainWindow.keyboard.type('const hello = "world";')

    // Verify the content in the store
    const content = await mainWindow.evaluate((id) => {
      const stores = (window as any).__SMOKE_STORES__
      const session = stores.sessionStore.getState().sessions.get(id)
      return session?.content
    }, sessionId)

    expect(content).toContain('const hello = "world";')
  })

  test('create snippet with initial content', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const code = 'function greet(name) {\n  return `Hello, ${name}!`;\n}'
    const sessionId = await createSnippet(mainWindow, {
      content: code,
      language: 'javascript',
    })

    const cmContent = mainWindow.locator(
      `.snippet-window[data-session-id="${sessionId}"] .cm-content`
    )
    await expect(cmContent).toContainText('function greet(name)')
  })
})

test.describe('Syntax Highlighting and Language Selection', () => {
  test('change language via dropdown', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSnippet(mainWindow, {
      content: 'print("hello")',
      language: 'javascript',
    })

    const langSelect = mainWindow.locator(
      `.snippet-window[data-session-id="${sessionId}"] .snippet-lang-select`
    )
    await expect(langSelect).toHaveValue('javascript')

    // Change to Python
    await langSelect.selectOption('python')
    await mainWindow.waitForTimeout(500)

    // Verify store updated
    const language = await mainWindow.evaluate((id) => {
      const stores = (window as any).__SMOKE_STORES__
      const session = stores.sessionStore.getState().sessions.get(id)
      return session?.language
    }, sessionId)

    expect(language).toBe('python')
  })

  test('highlighting updates when language changes', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const code = 'const x = 42;'
    const sessionId = await createSnippet(mainWindow, {
      content: code,
      language: 'javascript',
    })

    // Capture the editor HTML with JavaScript highlighting
    const snippetSelector = `.snippet-window[data-session-id="${sessionId}"]`
    await mainWindow.waitForTimeout(500)

    const htmlBefore = await mainWindow.evaluate((sel) => {
      const el = document.querySelector(`${sel} .cm-content`)
      return el?.innerHTML ?? ''
    }, snippetSelector)

    // Change to Python
    const langSelect = mainWindow.locator(`${snippetSelector} .snippet-lang-select`)
    await langSelect.selectOption('python')
    await mainWindow.waitForTimeout(500)

    // Capture the editor HTML with Python highlighting
    const htmlAfter = await mainWindow.evaluate((sel) => {
      const el = document.querySelector(`${sel} .cm-content`)
      return el?.innerHTML ?? ''
    }, snippetSelector)

    // The HTML should differ because CodeMirror applies different syntax tokens
    expect(htmlAfter).not.toBe(htmlBefore)
  })

  test('all supported languages available in dropdown', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    await createSnippet(mainWindow)

    const options = await mainWindow.locator('.snippet-lang-select option').allTextContents()

    const expectedLangs = [
      'javascript', 'typescript', 'tsx', 'jsx', 'python', 'html', 'css',
      'json', 'markdown', 'rust', 'go', 'java', 'c', 'cpp', 'csharp',
      'sql', 'yaml', 'xml', 'php', 'text',
    ]

    for (const lang of expectedLangs) {
      expect(options).toContain(lang)
    }
  })
})

test.describe('Code Snippet Drag and Resize', () => {
  test('drag snippet by title bar updates position', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSnippet(mainWindow, { position: { x: 100, y: 80 } })

    const before = await getWindowStyle(mainWindow, sessionId)

    const chrome = mainWindow.locator(
      `.snippet-window[data-session-id="${sessionId}"] .window-chrome`
    )
    const chromeBbox = await chrome.boundingBox()
    expect(chromeBbox).toBeTruthy()

    const startX = chromeBbox!.x + chromeBbox!.width / 2
    const startY = chromeBbox!.y + chromeBbox!.height / 2

    await mainWindow.mouse.move(startX, startY)
    await mainWindow.mouse.down()
    await mainWindow.mouse.move(startX + 150, startY + 100, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId)
    expect(after.left).toBeGreaterThan(before.left)
    expect(after.top).toBeGreaterThan(before.top)
  })

  test('resize snippet via southeast handle', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSnippet(mainWindow, { position: { x: 100, y: 80 } })

    const before = await getWindowStyle(mainWindow, sessionId)

    const start = await startResize(mainWindow, sessionId, 'se')

    await mainWindow.mouse.move(start.startX + 120, start.startY + 80, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId)
    expect(after.width).toBeGreaterThan(before.width)
    expect(after.height).toBeGreaterThan(before.height)
  })

  test('resize snippet via east handle updates width only', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const sessionId = await createSnippet(mainWindow, { position: { x: 100, y: 80 } })

    const before = await getWindowStyle(mainWindow, sessionId)

    const start = await startResize(mainWindow, sessionId, 'e')

    await mainWindow.mouse.move(start.startX + 100, start.startY, { steps: 10 })
    await mainWindow.mouse.up()

    await mainWindow.waitForTimeout(500)

    const after = await getWindowStyle(mainWindow, sessionId)
    expect(after.width).toBeGreaterThan(before.width)
    expect(after.height).toBe(before.height)
  })
})

test.describe('Code Snippet Persistence', () => {
  test('snippet persists across layout save/load', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    // Create a snippet with specific content and language
    const code = 'fn main() {\n    println!("Hello, Rust!");\n}'
    const sessionId = await createSnippet(mainWindow, {
      content: code,
      language: 'rust',
      position: { x: 200, y: 150 },
    })

    // Update the title
    await mainWindow.evaluate((id) => {
      const stores = (window as any).__SMOKE_STORES__
      stores.sessionStore.getState().updateSession(id, { title: 'My Rust Snippet' })
    }, sessionId)

    await mainWindow.waitForTimeout(300)

    // Save layout via the layout API
    await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const sessions = stores.sessionStore.getState().sessions
      const savedSessions: any[] = []
      for (const s of sessions.values()) {
        if (s.type === 'snippet') {
          savedSessions.push({
            type: 'snippet' as const,
            title: s.title,
            cwd: '',
            content: s.content,
            language: s.language,
            position: s.position,
            size: s.size,
          })
        }
      }
      return window.smokeAPI.layout.save('e2e-snippet-test', {
        name: 'e2e-snippet-test',
        sessions: savedSessions,
        viewport: { panX: 0, panY: 0, zoom: 1 },
        gridSize: 20,
      })
    })

    // Clear all sessions
    await closeAllSessions(mainWindow)
    const snippetWindows = mainWindow.locator('.snippet-window')
    await expect(snippetWindows).toHaveCount(0, { timeout: 5000 })

    // Load the saved layout and restore snippet sessions
    await mainWindow.evaluate(async () => {
      const layout = await window.smokeAPI.layout.load('e2e-snippet-test')
      if (!layout) throw new Error('Layout not found')

      for (const saved of layout.sessions) {
        if (saved.type === 'snippet') {
          const stores = (window as any).__SMOKE_STORES__
          const store = stores.sessionStore.getState()
          const session = store.createSnippetSession(
            (saved as any).language,
            (saved as any).content,
            saved.position
          )
          store.updateSession(session.id, {
            title: saved.title,
            size: saved.size,
          })
        }
      }
    })

    // Verify snippet was restored
    await expect(snippetWindows).toHaveCount(1, { timeout: 5000 })

    // Verify content is in the editor
    const cmContent = snippetWindows.first().locator('.cm-content')
    await expect(cmContent).toContainText('println!("Hello, Rust!")')

    // Verify language is correct in the dropdown
    const langSelect = snippetWindows.first().locator('.snippet-lang-select')
    await expect(langSelect).toHaveValue('rust')

    // Verify language in the store
    const storedLang = await mainWindow.evaluate(() => {
      const stores = (window as any).__SMOKE_STORES__
      const sessions = stores.sessionStore.getState().sessions
      for (const s of sessions.values()) {
        if (s.type === 'snippet') return s.language
      }
      return null
    })
    expect(storedLang).toBe('rust')

    // Cleanup
    await mainWindow.evaluate(() => window.smokeAPI.layout.delete('e2e-snippet-test'))
  })

  test('snippet content survives language change', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    const code = 'const x = 42;\nconsole.log(x);'
    const sessionId = await createSnippet(mainWindow, {
      content: code,
      language: 'javascript',
    })

    // Change language to Python
    const langSelect = mainWindow.locator(
      `.snippet-window[data-session-id="${sessionId}"] .snippet-lang-select`
    )
    await langSelect.selectOption('python')
    await mainWindow.waitForTimeout(500)

    // Verify the content is still there (CodeMirror recreates with same content)
    const storedContent = await mainWindow.evaluate((id) => {
      const stores = (window as any).__SMOKE_STORES__
      const session = stores.sessionStore.getState().sessions.get(id)
      return session?.content
    }, sessionId)

    expect(storedContent).toContain('const x = 42;')
    expect(storedContent).toContain('console.log(x);')
  })

  test('delete snippet via close button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await closeAllSessions(mainWindow)

    await createSnippet(mainWindow)

    const snippetWindows = mainWindow.locator('.snippet-window')
    await expect(snippetWindows).toHaveCount(1, { timeout: 5000 })

    // Close via X button
    const closeBtn = snippetWindows.first().locator('.window-chrome-close')
    await closeBtn.click({ force: true })

    await expect(snippetWindows).toHaveCount(0, { timeout: 5000 })
  })
})
