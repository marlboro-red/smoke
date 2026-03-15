import type { ElectronApplication, Page } from '@playwright/test'

/**
 * Wait for the app to finish its initial React render.
 * Checks for the root React mount point having children.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('#root', { state: 'attached' })
  // Wait for React to mount — the root div should have child elements
  await page.waitForFunction(() => {
    const root = document.getElementById('root')
    return root !== null && root.children.length > 0
  })
}

/**
 * Evaluate a function inside the renderer process and return the result.
 * Useful for reading Zustand store state.
 *
 * @example
 *   const sessions = await evaluate(page, () => {
 *     return window.__SMOKE_STORES__.sessionStore.getState().sessions
 *   })
 */
export async function evaluate<T>(page: Page, fn: () => T): Promise<T> {
  return page.evaluate(fn)
}

/**
 * Get the title of the main BrowserWindow.
 */
export async function getWindowTitle(app: ElectronApplication): Promise<string> {
  const window = await app.firstWindow()
  return window.title()
}

/**
 * Take a screenshot and save it to the given path.
 * Useful for debugging test failures.
 */
export async function takeScreenshot(page: Page, name: string): Promise<Buffer> {
  return page.screenshot({ path: `e2e/screenshots/${name}.png` })
}

/**
 * Count the number of open BrowserWindows.
 */
export async function getWindowCount(app: ElectronApplication): Promise<number> {
  const windows = app.windows()
  return windows.length
}

/**
 * Simulate a keyboard shortcut in the main window.
 * Uses platform-appropriate modifier (Meta on macOS, Control elsewhere).
 */
export async function pressShortcut(page: Page, key: string, options?: { shift?: boolean }): Promise<void> {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  const parts = [modifier]
  if (options?.shift) parts.push('Shift')
  parts.push(key)
  await page.keyboard.press(parts.join('+'))
}
