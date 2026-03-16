import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'

/** Delete all existing bookmarks via IPC to ensure a clean state. */
async function clearAllBookmarks(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const list = await window.smokeAPI?.bookmark.list()
    if (list) {
      for (const bm of list) {
        await window.smokeAPI?.bookmark.delete(bm.name)
      }
    }
  })
}

test.describe('Bookmarks: save, load, navigation, and deletion', () => {
  test('save a bookmark and verify it appears in the list', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Expand the bookmark panel
    const toggleBtn = mainWindow.locator('.bookmark-toggle-btn')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)

    // Type a bookmark name and save
    const nameInput = mainWindow.locator('.bookmark-name-input')
    await nameInput.fill('test-bookmark-1')

    const saveBtn = mainWindow.locator('.bookmark-save-btn')
    await saveBtn.click()
    await mainWindow.waitForTimeout(500)

    // Verify bookmark appears in the list
    const bookmarkName = mainWindow.locator('.bookmark-list-item .bookmark-name', { hasText: 'test-bookmark-1' })
    await expect(bookmarkName).toBeVisible({ timeout: 3000 })

    // Verify input was cleared after save
    await expect(nameInput).toHaveValue('')
  })

  test('save a bookmark via IPC and verify it shows in the sidebar panel', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Save a bookmark directly via IPC
    await mainWindow.evaluate(async () => {
      await window.smokeAPI?.bookmark.save('ipc-bookmark', {
        name: 'ipc-bookmark',
        panX: 200,
        panY: -150,
        zoom: 1.5,
      })
    })

    // Expand the bookmark panel
    const toggleBtn = mainWindow.locator('.bookmark-toggle-btn')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)

    // Verify bookmark appears in the list
    const bookmarkName = mainWindow.locator('.bookmark-list-item .bookmark-name', { hasText: 'ipc-bookmark' })
    await expect(bookmarkName).toBeVisible({ timeout: 3000 })

    // Verify tooltip contains the saved coordinates
    const title = await bookmarkName.getAttribute('title')
    expect(title).toContain('200')
    expect(title).toContain('-150')
    expect(title).toContain('1.50')
  })

  test('load bookmark navigates viewport to saved position', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Save a bookmark at a specific position via IPC
    const targetPanX = 500
    const targetPanY = -300
    const targetZoom = 0.8

    await mainWindow.evaluate(async ({ panX, panY, zoom }: { panX: number; panY: number; zoom: number }) => {
      await window.smokeAPI?.bookmark.save('nav-bookmark', {
        name: 'nav-bookmark',
        panX,
        panY,
        zoom,
      })
    }, { panX: targetPanX, panY: targetPanY, zoom: targetZoom })

    // Expand the bookmark panel
    const toggleBtn = mainWindow.locator('.bookmark-toggle-btn')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)

    // Click the bookmark to navigate
    const bookmarkName = mainWindow.locator('.bookmark-list-item .bookmark-name', { hasText: 'nav-bookmark' })
    await expect(bookmarkName).toBeVisible({ timeout: 3000 })
    await bookmarkName.click()

    // Wait for the 300ms animation to complete plus buffer
    await mainWindow.waitForTimeout(500)

    // Verify the viewport has moved by checking the CSS transform on .canvas-viewport
    const transform = await mainWindow.locator('.canvas-viewport').getAttribute('style')
    expect(transform).toBeTruthy()

    // Parse the transform to verify position — translate3d(Xpx, Ypx, 0) scale(Z)
    const match = transform!.match(/translate3d\(([^,]+)px,\s*([^,]+)px,\s*0(?:px)?\)\s*scale\(([^)]+)\)/)
    expect(match).toBeTruthy()

    const actualX = parseFloat(match![1])
    const actualY = parseFloat(match![2])
    const actualZoom = parseFloat(match![3])

    // Allow small floating-point tolerance
    expect(actualX).toBeCloseTo(targetPanX, 0)
    expect(actualY).toBeCloseTo(targetPanY, 0)
    expect(actualZoom).toBeCloseTo(targetZoom, 1)
  })

  test('delete a bookmark removes it from the list and config', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Save a bookmark via IPC
    await mainWindow.evaluate(async () => {
      await window.smokeAPI?.bookmark.save('delete-me', {
        name: 'delete-me',
        panX: 0,
        panY: 0,
        zoom: 1,
      })
    })

    // Expand the bookmark panel
    const toggleBtn = mainWindow.locator('.bookmark-toggle-btn')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)

    // Verify bookmark exists
    const bookmarkItem = mainWindow.locator('.bookmark-list-item', { hasText: 'delete-me' })
    await expect(bookmarkItem).toBeVisible({ timeout: 3000 })

    // Click the delete button
    const deleteBtn = bookmarkItem.locator('.bookmark-delete-btn')
    await deleteBtn.click()
    await mainWindow.waitForTimeout(500)

    // Verify bookmark is removed from the list
    await expect(bookmarkItem).toHaveCount(0, { timeout: 3000 })

    // Verify it's also removed from the config store
    const bookmarks = await mainWindow.evaluate(async () => {
      return await window.smokeAPI?.bookmark.list()
    })
    const found = bookmarks?.find((b: any) => b.name === 'delete-me')
    expect(found).toBeUndefined()
  })

  test('bookmark list shows multiple bookmarks in the sidebar', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Clear any existing bookmarks from previous tests
    await clearAllBookmarks(mainWindow)

    // Save multiple bookmarks via IPC
    await mainWindow.evaluate(async () => {
      await window.smokeAPI?.bookmark.save('bm-alpha', {
        name: 'bm-alpha',
        panX: 100,
        panY: 100,
        zoom: 1,
      })
      await window.smokeAPI?.bookmark.save('bm-beta', {
        name: 'bm-beta',
        panX: -200,
        panY: 300,
        zoom: 2,
      })
      await window.smokeAPI?.bookmark.save('bm-gamma', {
        name: 'bm-gamma',
        panX: 0,
        panY: 0,
        zoom: 0.5,
      })
    })

    // Expand the bookmark panel
    const toggleBtn = mainWindow.locator('.bookmark-toggle-btn')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)

    // Verify all three bookmarks are listed
    const items = mainWindow.locator('.bookmark-list-item')
    await expect(items).toHaveCount(3, { timeout: 3000 })

    // Verify each name is visible
    await expect(mainWindow.locator('.bookmark-name', { hasText: 'bm-alpha' })).toBeVisible()
    await expect(mainWindow.locator('.bookmark-name', { hasText: 'bm-beta' })).toBeVisible()
    await expect(mainWindow.locator('.bookmark-name', { hasText: 'bm-gamma' })).toBeVisible()

    // Each item has a delete button
    const deleteButtons = mainWindow.locator('.bookmark-delete-btn')
    await expect(deleteButtons).toHaveCount(3)
  })

  test('animated transition between bookmarks changes viewport smoothly', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Save two bookmarks at different positions
    await mainWindow.evaluate(async () => {
      await window.smokeAPI?.bookmark.save('position-a', {
        name: 'position-a',
        panX: 0,
        panY: 0,
        zoom: 1,
      })
      await window.smokeAPI?.bookmark.save('position-b', {
        name: 'position-b',
        panX: 800,
        panY: -600,
        zoom: 0.5,
      })
    })

    // Expand the bookmark panel
    const toggleBtn = mainWindow.locator('.bookmark-toggle-btn')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)

    // Navigate to bookmark A first to set known starting position
    const bmA = mainWindow.locator('.bookmark-name', { hasText: 'position-a' })
    await bmA.click()
    await mainWindow.waitForTimeout(500)

    // Now click bookmark B and check mid-animation state
    const bmB = mainWindow.locator('.bookmark-name', { hasText: 'position-b' })
    await bmB.click()

    // Wait ~150ms (mid-animation — the animation is 300ms)
    await mainWindow.waitForTimeout(150)

    // Read intermediate transform — should be between A and B
    const midTransform = await mainWindow.locator('.canvas-viewport').getAttribute('style')
    const midMatch = midTransform?.match(/translate3d\(([^,]+)px,\s*([^,]+)px/)
    const midX = midMatch ? parseFloat(midMatch[1]) : 0

    // Wait for animation to finish
    await mainWindow.waitForTimeout(300)

    // Read final transform
    const finalTransform = await mainWindow.locator('.canvas-viewport').getAttribute('style')
    const finalMatch = finalTransform?.match(/translate3d\(([^,]+)px,\s*([^,]+)px,\s*0(?:px)?\)\s*scale\(([^)]+)\)/)
    expect(finalMatch).toBeTruthy()

    const finalX = parseFloat(finalMatch![1])
    const finalY = parseFloat(finalMatch![2])
    const finalZoom = parseFloat(finalMatch![3])

    // Mid-animation X should be between 0 and 800 (indicates animation occurred)
    expect(midX).toBeGreaterThan(0)
    expect(midX).toBeLessThan(800)

    // Final position should match bookmark B
    expect(finalX).toBeCloseTo(800, 0)
    expect(finalY).toBeCloseTo(-600, 0)
    expect(finalZoom).toBeCloseTo(0.5, 1)
  })

  test('saving bookmark with Enter key works', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Expand the bookmark panel
    const toggleBtn = mainWindow.locator('.bookmark-toggle-btn')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)

    // Type a name and press Enter
    const nameInput = mainWindow.locator('.bookmark-name-input')
    await nameInput.fill('enter-bookmark')
    await nameInput.press('Enter')
    await mainWindow.waitForTimeout(500)

    // Verify bookmark was saved
    const bookmarkName = mainWindow.locator('.bookmark-name', { hasText: 'enter-bookmark' })
    await expect(bookmarkName).toBeVisible({ timeout: 3000 })
  })

  test('empty bookmark name is not saved', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Clear any existing bookmarks
    await clearAllBookmarks(mainWindow)

    // Expand the bookmark panel
    const toggleBtn = mainWindow.locator('.bookmark-toggle-btn')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)

    // Click save with empty input
    const saveBtn = mainWindow.locator('.bookmark-save-btn')
    await saveBtn.click()
    await mainWindow.waitForTimeout(300)

    // Verify no bookmark was created via IPC
    const bookmarks = await mainWindow.evaluate(async () => {
      return await window.smokeAPI?.bookmark.list()
    })
    expect(bookmarks).toHaveLength(0)
  })

  test('collapsing and re-expanding bookmark panel refreshes list', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Clear any existing bookmarks
    await clearAllBookmarks(mainWindow)

    // Save a bookmark via IPC
    await mainWindow.evaluate(async () => {
      await window.smokeAPI?.bookmark.save('refresh-bm', {
        name: 'refresh-bm',
        panX: 0,
        panY: 0,
        zoom: 1,
      })
    })

    const toggleBtn = mainWindow.locator('.bookmark-toggle-btn')

    // Expand — should show the bookmark
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)
    await expect(mainWindow.locator('.bookmark-name').getByText('refresh-bm', { exact: true })).toBeVisible({ timeout: 3000 })

    // Collapse
    await toggleBtn.click()
    await mainWindow.waitForTimeout(200)

    // Add another bookmark via IPC while collapsed
    await mainWindow.evaluate(async () => {
      await window.smokeAPI?.bookmark.save('refresh-bm-2', {
        name: 'refresh-bm-2',
        panX: 50,
        panY: 50,
        zoom: 1.2,
      })
    })

    // Re-expand — should show both bookmarks
    await toggleBtn.click()
    await mainWindow.waitForTimeout(300)
    await expect(mainWindow.locator('.bookmark-name').getByText('refresh-bm', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(mainWindow.locator('.bookmark-name').getByText('refresh-bm-2', { exact: true })).toBeVisible({ timeout: 3000 })
  })
})
