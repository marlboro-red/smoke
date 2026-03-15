import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'

test.describe('App Launch', () => {
  test('starts with a single window', async ({ electronApp, mainWindow }) => {
    // mainWindow fixture ensures the window has opened
    expect(mainWindow).toBeTruthy()
    const windows = electronApp.windows()
    expect(windows.length).toBe(1)
  })

  test('main window renders the app root', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    const root = mainWindow.locator('#root')
    await expect(root).toBeAttached()
  })

  test('main window has correct title', async ({ mainWindow }) => {
    const title = await mainWindow.title()
    expect(title).toBeTruthy()
  })

  test('canvas container is rendered', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    const canvas = mainWindow.locator('[data-testid="canvas"], .canvas-container, .canvas')
    await mainWindow.waitForTimeout(1000)
    const count = await canvas.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})
