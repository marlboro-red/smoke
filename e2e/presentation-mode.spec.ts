import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

/**
 * Helper: add three bookmarks at different canvas positions via the store.
 */
async function setupBookmarks(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const stores = (window as any).__SMOKE_STORES__
    const ps = stores.presentationStore.getState()
    ps.addBookmark({ name: 'Slide 1', panX: 0, panY: 0, zoom: 1 })
    ps.addBookmark({ name: 'Slide 2', panX: -500, panY: -300, zoom: 0.8 })
    ps.addBookmark({ name: 'Slide 3', panX: -1000, panY: -600, zoom: 1.2 })
  })
}

test.describe('Presentation Mode', () => {
  test('enter presentation mode with F5, verify fullscreen class and sidebar hidden', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupBookmarks(mainWindow)

    // Sidebar should be visible before presentation
    const sidebarBefore = await mainWindow.locator('.sidebar').count()
    expect(sidebarBefore).toBeGreaterThanOrEqual(1)

    // Start presentation with F5
    await mainWindow.keyboard.press('F5')

    // Verify presentation-active class on <html>
    await expect(mainWindow.locator('html.presentation-active')).toBeAttached({ timeout: 3000 })

    // Verify sidebar is hidden (display: none via CSS)
    const sidebar = mainWindow.locator('.sidebar')
    await expect(sidebar).toBeHidden({ timeout: 3000 })

    // Verify presentation overlay is visible
    await expect(mainWindow.locator('.presentation-overlay')).toBeAttached({ timeout: 3000 })
  })

  test('navigate between slides with arrow keys', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupBookmarks(mainWindow)

    // Start presentation
    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.presentationStore.getState().startPresentation()
    })
    await expect(mainWindow.locator('.presentation-overlay')).toBeAttached({ timeout: 3000 })

    // Should start at slide 1
    const slideCount = mainWindow.locator('.presentation-slide-count')
    await expect(slideCount).toHaveText('1 / 3')

    const slideName = mainWindow.locator('.presentation-slide-name')
    await expect(slideName).toHaveText('Slide 1')

    // Press ArrowRight to go to slide 2
    await mainWindow.keyboard.press('ArrowRight')
    await expect(slideCount).toHaveText('2 / 3')
    await expect(slideName).toHaveText('Slide 2')

    // Press ArrowRight to go to slide 3
    await mainWindow.keyboard.press('ArrowRight')
    await expect(slideCount).toHaveText('3 / 3')
    await expect(slideName).toHaveText('Slide 3')

    // Press ArrowRight at last slide — should stay at 3
    await mainWindow.keyboard.press('ArrowRight')
    await expect(slideCount).toHaveText('3 / 3')

    // Press ArrowLeft to go back to slide 2
    await mainWindow.keyboard.press('ArrowLeft')
    await expect(slideCount).toHaveText('2 / 3')
    await expect(slideName).toHaveText('Slide 2')

    // Press ArrowLeft to go back to slide 1
    await mainWindow.keyboard.press('ArrowLeft')
    await expect(slideCount).toHaveText('1 / 3')

    // Press ArrowLeft at first slide — should stay at 1
    await mainWindow.keyboard.press('ArrowLeft')
    await expect(slideCount).toHaveText('1 / 3')
  })

  test('slide indicator and dots display correctly', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupBookmarks(mainWindow)

    // Start presentation
    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.presentationStore.getState().startPresentation()
    })
    await expect(mainWindow.locator('.presentation-overlay')).toBeAttached({ timeout: 3000 })

    // Should show 3 dots (one per bookmark)
    const dots = mainWindow.locator('.presentation-dot')
    await expect(dots).toHaveCount(3)

    // First dot should be active
    await expect(dots.nth(0)).toHaveClass(/presentation-dot--active/)
    await expect(dots.nth(1)).not.toHaveClass(/presentation-dot--active/)
    await expect(dots.nth(2)).not.toHaveClass(/presentation-dot--active/)

    // Navigate to slide 2
    await mainWindow.keyboard.press('ArrowRight')

    // Second dot should now be active
    await expect(dots.nth(0)).not.toHaveClass(/presentation-dot--active/)
    await expect(dots.nth(1)).toHaveClass(/presentation-dot--active/)
    await expect(dots.nth(2)).not.toHaveClass(/presentation-dot--active/)

    // Click on third dot for direct navigation
    await dots.nth(2).click()

    // Third dot should now be active
    await expect(dots.nth(2)).toHaveClass(/presentation-dot--active/)
    await expect(mainWindow.locator('.presentation-slide-count')).toHaveText('3 / 3')
    await expect(mainWindow.locator('.presentation-slide-name')).toHaveText('Slide 3')
  })

  test('previous/next buttons navigate and disable at boundaries', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupBookmarks(mainWindow)

    // Start presentation
    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.presentationStore.getState().startPresentation()
    })
    await expect(mainWindow.locator('.presentation-overlay')).toBeAttached({ timeout: 3000 })

    const prevBtn = mainWindow.locator('.presentation-btn--nav').first()
    const nextBtn = mainWindow.locator('.presentation-btn--nav').last()

    // At first slide: prev disabled, next enabled
    await expect(prevBtn).toBeDisabled()
    await expect(nextBtn).toBeEnabled()

    // Click next → slide 2
    await nextBtn.click()
    await expect(mainWindow.locator('.presentation-slide-count')).toHaveText('2 / 3')

    // Both buttons should be enabled at middle slide
    await expect(prevBtn).toBeEnabled()
    await expect(nextBtn).toBeEnabled()

    // Click next → slide 3
    await nextBtn.click()
    await expect(mainWindow.locator('.presentation-slide-count')).toHaveText('3 / 3')

    // At last slide: next disabled, prev enabled
    await expect(nextBtn).toBeDisabled()
    await expect(prevBtn).toBeEnabled()

    // Click prev → slide 2
    await prevBtn.click()
    await expect(mainWindow.locator('.presentation-slide-count')).toHaveText('2 / 3')
  })

  test('exit presentation mode with Escape restores normal UI', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupBookmarks(mainWindow)

    // Start presentation
    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.presentationStore.getState().startPresentation()
    })
    await expect(mainWindow.locator('.presentation-overlay')).toBeAttached({ timeout: 3000 })
    await expect(mainWindow.locator('html.presentation-active')).toBeAttached()

    // Press Escape to exit
    await mainWindow.keyboard.press('Escape')

    // Overlay should be gone
    await expect(mainWindow.locator('.presentation-overlay')).not.toBeAttached({ timeout: 3000 })

    // presentation-active class should be removed
    await expect(mainWindow.locator('html.presentation-active')).not.toBeAttached({ timeout: 3000 })

    // Sidebar should be visible again
    await expect(mainWindow.locator('.sidebar')).toBeVisible({ timeout: 3000 })

    // Store should reflect not presenting
    const isPresenting = await mainWindow.evaluate(() => {
      return (window as any).__SMOKE_STORES__.presentationStore.getState().isPresenting
    })
    expect(isPresenting).toBe(false)
  })

  test('exit presentation mode with Exit button restores normal UI', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await setupBookmarks(mainWindow)

    // Start presentation
    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.presentationStore.getState().startPresentation()
    })
    await expect(mainWindow.locator('.presentation-overlay')).toBeAttached({ timeout: 3000 })

    // Click Exit button
    await mainWindow.locator('.presentation-btn--exit').click()

    // Overlay should be gone
    await expect(mainWindow.locator('.presentation-overlay')).not.toBeAttached({ timeout: 3000 })

    // presentation-active class should be removed
    await expect(mainWindow.locator('html.presentation-active')).not.toBeAttached({ timeout: 3000 })

    // Sidebar should be visible again
    await expect(mainWindow.locator('.sidebar')).toBeVisible({ timeout: 3000 })
  })
})
