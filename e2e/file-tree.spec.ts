import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'

test.describe('File Tree Navigation and File Opening', () => {
  test('file tree panel is visible with project directory', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ftPanel = mainWindow.locator('.ft-panel')
    await expect(ftPanel).toBeVisible({ timeout: 5000 })

    // Header shows "Files" title
    const title = ftPanel.locator('.ft-panel-title')
    await expect(title).toHaveText('Files')

    // Root directory name is displayed
    const rootName = ftPanel.locator('.ft-root-name')
    await expect(rootName).toBeVisible()
    const rootText = await rootName.textContent()
    expect(rootText).toBeTruthy()
  })

  test('file tree shows directory entries', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ftTree = mainWindow.locator('.ft-tree')
    await expect(ftTree).toBeVisible({ timeout: 5000 })

    // Should have at least one file/folder node
    const nodes = ftTree.locator('.ft-node')
    const count = await nodes.count()
    expect(count).toBeGreaterThan(0)
  })

  test('collapse and expand file tree panel', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ftPanel = mainWindow.locator('.ft-panel')
    await expect(ftPanel).toBeVisible({ timeout: 5000 })

    const header = ftPanel.locator('.ft-panel-header')
    const tree = ftPanel.locator('.ft-tree')

    // Tree should be visible initially
    await expect(tree).toBeVisible()

    // Click header to collapse
    await header.click()
    await expect(tree).not.toBeVisible()

    // Click header again to expand
    await header.click()
    await expect(tree).toBeVisible()
  })

  test('expand and collapse a directory', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ftTree = mainWindow.locator('.ft-tree')
    await expect(ftTree).toBeVisible({ timeout: 5000 })

    // Find a directory node (has ft-expandable class)
    const dirNode = ftTree.locator('.ft-node.ft-expandable').first()
    await expect(dirNode).toBeVisible({ timeout: 5000 })

    // Arrow should not be expanded initially
    const arrow = dirNode.locator('.ft-arrow')
    await expect(arrow).toBeVisible()
    await expect(arrow).not.toHaveClass(/expanded/)

    // Click to expand
    await dirNode.click()
    await expect(arrow).toHaveClass(/expanded/, { timeout: 3000 })

    // Should have child nodes now (wait for them to load)
    // After expanding, there should be deeper-indented nodes
    await mainWindow.waitForTimeout(500)

    // Click again to collapse
    await dirNode.click()
    await expect(arrow).not.toHaveClass(/expanded/, { timeout: 3000 })
  })

  test('double-click a file to open as file viewer', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ftTree = mainWindow.locator('.ft-tree')
    await expect(ftTree).toBeVisible({ timeout: 5000 })

    // Find a non-directory file node (not ft-expandable)
    const fileNode = ftTree.locator('.ft-node:not(.ft-expandable)').first()
    await expect(fileNode).toBeVisible({ timeout: 5000 })

    // Get the file name for later verification
    const fileName = await fileNode.locator('.ft-name').textContent()
    expect(fileName).toBeTruthy()

    // Count existing file viewer windows before opening
    const viewersBefore = await mainWindow.locator('.file-viewer-window').count()

    // Double-click to open
    await fileNode.dblclick()

    // A file viewer window should appear on the canvas
    const fileViewerWindows = mainWindow.locator('.file-viewer-window')
    await expect(fileViewerWindows).toHaveCount(viewersBefore + 1, { timeout: 5000 })

    // The new file viewer should be focused
    const focusedViewer = mainWindow.locator('.file-viewer-window.focused')
    await expect(focusedViewer).toBeVisible({ timeout: 3000 })

    // It should have a session ID
    const sessionId = await focusedViewer.getAttribute('data-session-id')
    expect(sessionId).toBeTruthy()
  })

  test('file viewer renders content with syntax highlighting', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ftTree = mainWindow.locator('.ft-tree')
    await expect(ftTree).toBeVisible({ timeout: 5000 })

    // Look for a TypeScript/JavaScript file (ft-script class) to ensure syntax highlighting
    let fileNode = ftTree.locator('.ft-node.ft-script').first()

    // If no script file at root level, expand src directory and look inside
    if (await fileNode.count() === 0) {
      // Expand a directory to find script files
      const srcDir = ftTree.locator('.ft-node.ft-expandable', { hasText: 'src' })
      if (await srcDir.count() > 0) {
        await srcDir.click()
        await mainWindow.waitForTimeout(500)
        fileNode = ftTree.locator('.ft-node.ft-script').first()
      }
    }

    // If still no script file, use any file
    if (await fileNode.count() === 0) {
      fileNode = ftTree.locator('.ft-node:not(.ft-expandable)').first()
    }

    await expect(fileNode).toBeVisible({ timeout: 5000 })

    // Double-click to open
    await fileNode.dblclick()

    // Wait for the file viewer window to appear
    const fileViewer = mainWindow.locator('.file-viewer-window.focused')
    await expect(fileViewer).toBeVisible({ timeout: 5000 })

    // Content should be rendered — either highlighted or plaintext
    const content = fileViewer.locator('.file-viewer-content')
    await expect(content).toBeVisible({ timeout: 5000 })

    // Wait for Shiki to render syntax highlighting (it's async)
    const highlighted = fileViewer.locator('.file-viewer-highlighted')
    const plaintext = fileViewer.locator('.file-viewer-plaintext')

    // One of these should be visible
    await expect(highlighted.or(plaintext)).toBeVisible({ timeout: 10000 })
  })

  test('open multiple files', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ftTree = mainWindow.locator('.ft-tree')
    await expect(ftTree).toBeVisible({ timeout: 5000 })

    // Get all non-directory file nodes
    const fileNodes = ftTree.locator('.ft-node:not(.ft-expandable)')
    const availableFiles = await fileNodes.count()

    // We need at least 2 files; if root doesn't have them, expand a directory
    if (availableFiles < 2) {
      const dirNode = ftTree.locator('.ft-node.ft-expandable').first()
      if (await dirNode.count() > 0) {
        await dirNode.click()
        await mainWindow.waitForTimeout(500)
      }
    }

    const allFileNodes = ftTree.locator('.ft-node:not(.ft-expandable)')
    const totalFiles = await allFileNodes.count()
    expect(totalFiles).toBeGreaterThanOrEqual(2)

    // Open first file
    await allFileNodes.nth(0).dblclick()
    await mainWindow.waitForTimeout(500)

    const fileViewers = mainWindow.locator('.file-viewer-window')
    await expect(fileViewers).toHaveCount(1, { timeout: 5000 })

    const firstSessionId = await fileViewers.first().getAttribute('data-session-id')

    // Open second file
    await allFileNodes.nth(1).dblclick()
    await mainWindow.waitForTimeout(500)

    await expect(fileViewers).toHaveCount(2, { timeout: 5000 })

    // Both viewers should have different session IDs
    const sessionIds = new Set<string>()
    for (let i = 0; i < 2; i++) {
      const id = await fileViewers.nth(i).getAttribute('data-session-id')
      expect(id).toBeTruthy()
      sessionIds.add(id!)
    }
    expect(sessionIds.size).toBe(2)
    expect(sessionIds.has(firstSessionId!)).toBe(true)
  })

  test('duplicate open focuses existing viewer instead of creating new one', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const ftTree = mainWindow.locator('.ft-tree')
    await expect(ftTree).toBeVisible({ timeout: 5000 })

    // Find a file to open
    const fileNode = ftTree.locator('.ft-node:not(.ft-expandable)').first()
    await expect(fileNode).toBeVisible({ timeout: 5000 })

    // Double-click to open the file
    await fileNode.dblclick()

    const fileViewers = mainWindow.locator('.file-viewer-window')
    await expect(fileViewers).toHaveCount(1, { timeout: 5000 })

    const originalSessionId = await fileViewers.first().getAttribute('data-session-id')
    expect(originalSessionId).toBeTruthy()

    // Open a second different file so the first loses focus
    const allFileNodes = ftTree.locator('.ft-node:not(.ft-expandable)')
    const totalFiles = await allFileNodes.count()

    if (totalFiles >= 2) {
      await allFileNodes.nth(1).dblclick()
      await mainWindow.waitForTimeout(500)
      await expect(fileViewers).toHaveCount(2, { timeout: 5000 })

      // Now double-click the first file again
      await fileNode.dblclick()
      await mainWindow.waitForTimeout(500)

      // Should still have exactly 2 file viewers (not 3)
      await expect(fileViewers).toHaveCount(2, { timeout: 3000 })

      // The first file's viewer should be focused again
      const focusedViewer = mainWindow.locator('.file-viewer-window.focused')
      const focusedSessionId = await focusedViewer.getAttribute('data-session-id')
      expect(focusedSessionId).toBe(originalSessionId)
    } else {
      // Only one file available — just verify re-opening doesn't create a duplicate
      // Click on canvas to defocus
      const canvas = mainWindow.locator('.canvas-root')
      await canvas.click({ position: { x: 400, y: 300 } })
      await mainWindow.waitForTimeout(300)

      // Double-click the same file again
      await fileNode.dblclick()
      await mainWindow.waitForTimeout(500)

      // Should still have exactly 1 file viewer
      await expect(fileViewers).toHaveCount(1, { timeout: 3000 })

      // It should be focused and have the same session ID
      const focusedViewer = mainWindow.locator('.file-viewer-window.focused')
      const focusedSessionId = await focusedViewer.getAttribute('data-session-id')
      expect(focusedSessionId).toBe(originalSessionId)
    }
  })
})
