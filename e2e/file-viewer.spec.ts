import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * Create a temp file under the user's home directory.
 * Required because Smoke's fs:writefile IPC rejects paths outside ~.
 */
function createTempFile(name: string, content: string): string {
  const dir = path.join(os.homedir(), 'smoke-e2e-test', `fv-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

/** Remove temp file and its parent directory */
function cleanupTempFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
    fs.rmdirSync(path.dirname(filePath))
  } catch {
    // ignore cleanup errors
  }
}

/** Helper: open a file in the file viewer via sessionStore */
async function openFileViewer(
  page: import('@playwright/test').Page,
  filePath: string
): Promise<void> {
  await page.evaluate((fp) => {
    return window.smokeAPI.fs.readfile(fp).then(({ content }) => {
      const store = (window as any).__SMOKE_STORES__?.sessionStore
      if (store) {
        const session = store.getState().createFileSession(fp, content, 'typescript')
        store.getState().focusSession(session.id)
      }
    })
  }, filePath)
}

test.describe('File Viewer: Read and Edit Mode', () => {
  let tempFile: string

  test.beforeEach(() => {
    tempFile = createTempFile(
      'test-file.ts',
      'const greeting = "hello";\nconst name = "world";\nconsole.log(`${greeting}, ${name}!`);\n'
    )
  })

  test.afterEach(() => {
    cleanupTempFile(tempFile)
  })

  test('file content displays correctly in file viewer', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openFileViewer(mainWindow, tempFile)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Verify file content is displayed
    const body = fileWindow.first().locator('.file-viewer-body')
    await expect(body).toBeVisible()

    // The content area should contain our file text
    const content = fileWindow.first().locator('.file-viewer-content')
    await expect(content).toBeVisible({ timeout: 5000 })
    await expect(content).toContainText('const greeting')
    await expect(content).toContainText('hello')
  })

  test('toggle between read and edit mode via Edit button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openFileViewer(mainWindow, tempFile)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Initially in read mode — no .file-viewer-editing class
    await expect(fileWindow.first()).not.toHaveClass(/file-viewer-editing/)

    // Click Edit button to switch to edit mode
    const editBtn = fileWindow.first().locator('.file-viewer-edit-toggle', { hasText: 'Edit' })
    await editBtn.click()

    // Should now have editing class and show CodeMirror editor
    await expect(fileWindow.first()).toHaveClass(/file-viewer-editing/, { timeout: 3000 })
    const editorContainer = fileWindow.first().locator('.file-editor-container')
    await expect(editorContainer).toBeVisible({ timeout: 3000 })

    // Click View button to switch back to read mode
    const viewBtn = fileWindow.first().locator('.file-viewer-edit-toggle', { hasText: 'View' })
    await viewBtn.click()

    await expect(fileWindow.first()).not.toHaveClass(/file-viewer-editing/, { timeout: 3000 })
    const viewerContent = fileWindow.first().locator('.file-viewer-content')
    await expect(viewerContent).toBeVisible({ timeout: 3000 })
  })

  test('edit mode: make changes and verify dirty state indicator', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openFileViewer(mainWindow, tempFile)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Switch to edit mode
    const editBtn = fileWindow.first().locator('.file-viewer-edit-toggle', { hasText: 'Edit' })
    await editBtn.click()
    await expect(fileWindow.first()).toHaveClass(/file-viewer-editing/, { timeout: 3000 })

    // Not dirty initially
    await expect(fileWindow.first()).not.toHaveClass(/file-viewer-dirty/)

    // Type in the CodeMirror editor to make changes
    const editor = fileWindow.first().locator('.cm-content')
    await editor.click()
    await mainWindow.keyboard.type('// new comment\n')

    // Dirty state indicator should appear
    await expect(fileWindow.first()).toHaveClass(/file-viewer-dirty/, { timeout: 3000 })
  })

  test('save changes with Cmd+S and verify file written to disk', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openFileViewer(mainWindow, tempFile)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Switch to edit mode
    const editBtn = fileWindow.first().locator('.file-viewer-edit-toggle', { hasText: 'Edit' })
    await editBtn.click()
    await expect(fileWindow.first()).toHaveClass(/file-viewer-editing/, { timeout: 3000 })

    // Type new content at end of file
    const editor = fileWindow.first().locator('.cm-content')
    await editor.click()
    await mainWindow.keyboard.press('Meta+End')
    await mainWindow.keyboard.type('\n// E2E_SAVED_MARKER')

    // Should be dirty
    await expect(fileWindow.first()).toHaveClass(/file-viewer-dirty/, { timeout: 3000 })

    // Save with Cmd+S
    await mainWindow.keyboard.press('Meta+s')

    // Dirty indicator should disappear after save
    await expect(fileWindow.first()).not.toHaveClass(/file-viewer-dirty/, { timeout: 5000 })

    // Verify the file was actually written to disk
    await mainWindow.waitForTimeout(500)
    const savedContent = fs.readFileSync(tempFile, 'utf-8')
    expect(savedContent).toContain('E2E_SAVED_MARKER')
  })

  test('saved changes persist when re-opening the file', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openFileViewer(mainWindow, tempFile)

    const fileWindow = mainWindow.locator('.file-viewer-window')
    await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

    // Enter edit mode, type, and save
    const editBtn = fileWindow.first().locator('.file-viewer-edit-toggle', { hasText: 'Edit' })
    await editBtn.click()
    await expect(fileWindow.first()).toHaveClass(/file-viewer-editing/, { timeout: 3000 })

    const editor = fileWindow.first().locator('.cm-content')
    await editor.click()
    await mainWindow.keyboard.press('Meta+End')
    await mainWindow.keyboard.type('\n// PERSIST_TEST_MARKER')
    await mainWindow.keyboard.press('Meta+s')
    await expect(fileWindow.first()).not.toHaveClass(/file-viewer-dirty/, { timeout: 5000 })

    // Close the file viewer
    const closeBtn = fileWindow.first().locator('.window-chrome-close')
    await closeBtn.click({ force: true })
    await expect(fileWindow).toHaveCount(0, { timeout: 5000 })

    // Re-open the same file
    await openFileViewer(mainWindow, tempFile)

    const reopenedWindow = mainWindow.locator('.file-viewer-window')
    await expect(reopenedWindow.first()).toBeVisible({ timeout: 5000 })

    // Verify the saved content is present
    const content = reopenedWindow.first().locator('.file-viewer-content')
    await expect(content).toBeVisible({ timeout: 5000 })
    await expect(content).toContainText('PERSIST_TEST_MARKER')
  })

  test('go-to-line with Cmd+G', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a file with many lines
    const multiLineContent = Array.from(
      { length: 50 },
      (_, i) => `// Line ${i + 1}: content here`
    ).join('\n')
    const multiLineFile = createTempFile('multi-line.ts', multiLineContent)

    try {
      await openFileViewer(mainWindow, multiLineFile)

      const fileWindow = mainWindow.locator('.file-viewer-window')
      await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

      // Wait for file content to render
      const content = fileWindow.first().locator('.file-viewer-content')
      await expect(content).toBeVisible({ timeout: 5000 })

      // Press Cmd+G to open go-to-line
      await pressShortcut(mainWindow, 'g')

      // Go-to-line input bar should appear
      const goToLineBar = fileWindow.first().locator('.go-to-line-bar')
      await expect(goToLineBar).toBeVisible({ timeout: 3000 })

      // Type a line number and submit
      const goToLineInput = goToLineBar.locator('.go-to-line-input')
      await goToLineInput.fill('25')
      await mainWindow.keyboard.press('Enter')

      // The go-to-line bar should close after submission
      await expect(goToLineBar).not.toBeVisible({ timeout: 3000 })
    } finally {
      cleanupTempFile(multiLineFile)
    }
  })

  test('scroll wheel scrolls file content when viewer is focused', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a file with enough content to require scrolling
    const longContent = Array.from(
      { length: 200 },
      (_, i) => `// Line ${i + 1}: padding content for scroll test`
    ).join('\n')
    const longFile = createTempFile('long-file.ts', longContent)

    try {
      await openFileViewer(mainWindow, longFile)

      const fileWindow = mainWindow.locator('.file-viewer-window')
      await expect(fileWindow.first()).toBeVisible({ timeout: 5000 })

      // Wait for Shiki syntax highlighting to render
      const highlighted = fileWindow.first().locator('.file-viewer-highlighted')
      await expect(highlighted).toBeVisible({ timeout: 10000 })
      await mainWindow.waitForTimeout(500)

      // .file-viewer-highlighted is the scroll container (height:100%, overflow:auto)
      const scrollTopBefore = await highlighted.evaluate((el) => el.scrollTop)

      // Hover over the highlighted content so wheel events target it
      await highlighted.hover()
      await mainWindow.mouse.wheel(0, 500)
      await mainWindow.waitForTimeout(500)

      // Scroll position should have changed
      const scrollTopAfter = await highlighted.evaluate((el) => el.scrollTop)
      expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore)
    } finally {
      cleanupTempFile(longFile)
    }
  })
})
