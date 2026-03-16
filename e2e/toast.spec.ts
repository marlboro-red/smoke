import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'

test.describe('Toast Notification System', () => {
  test('toast appears when triggered via store', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.toastStore.getState().addToast('Test notification', 'info')
    })

    const toast = mainWindow.locator('.toast')
    await expect(toast.first()).toBeVisible({ timeout: 3000 })

    const message = toast.first().locator('.toast-message')
    await expect(message).toHaveText('Test notification')
  })

  test('info toast has correct severity class', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.toastStore.getState().addToast('Info toast', 'info', 10000)
    })

    const toast = mainWindow.locator('.toast--info')
    await expect(toast).toBeVisible({ timeout: 3000 })
  })

  test('success toast has correct severity class', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.toastStore.getState().addToast('Success toast', 'success', 10000)
    })

    const toast = mainWindow.locator('.toast--success')
    await expect(toast).toBeVisible({ timeout: 3000 })
  })

  test('warning toast has correct severity class', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.toastStore.getState().addToast('Warning toast', 'warning', 10000)
    })

    const toast = mainWindow.locator('.toast--warning')
    await expect(toast).toBeVisible({ timeout: 3000 })
  })

  test('error toast has correct severity class', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.toastStore.getState().addToast('Error toast', 'error', 10000)
    })

    const toast = mainWindow.locator('.toast--error')
    await expect(toast).toBeVisible({ timeout: 3000 })
  })

  test('toast auto-dismisses after timeout', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Use a short custom duration so the test doesn't take too long
    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.toastStore.getState().addToast('Auto dismiss', 'info', 1500)
    })

    const toast = mainWindow.locator('.toast')
    await expect(toast).toBeVisible({ timeout: 3000 })

    // Wait for auto-dismiss (1500ms duration + buffer)
    await expect(toast).not.toBeVisible({ timeout: 4000 })
  })

  test('toast with duration 0 does not auto-dismiss', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.toastStore.getState().addToast('Persistent toast', 'info', 0)
    })

    const toast = mainWindow.locator('.toast')
    await expect(toast).toBeVisible({ timeout: 3000 })

    // Wait well past normal auto-dismiss time
    await mainWindow.waitForTimeout(5000)

    // Toast should still be visible
    await expect(toast).toBeVisible()
  })

  test('manual dismiss via click removes toast', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Use duration 0 so it won't auto-dismiss
    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.toastStore.getState().addToast('Dismiss me', 'info', 0)
    })

    const toast = mainWindow.locator('.toast')
    await expect(toast).toBeVisible({ timeout: 3000 })

    const dismissBtn = toast.first().locator('.toast-dismiss')
    await dismissBtn.click()

    await expect(toast).not.toBeVisible({ timeout: 3000 })
  })

  test('multiple toasts display simultaneously', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__.toastStore.getState()
      store.addToast('First toast', 'info', 0)
      store.addToast('Second toast', 'success', 0)
      store.addToast('Third toast', 'warning', 0)
    })

    const toasts = mainWindow.locator('.toast')
    await expect(toasts).toHaveCount(3, { timeout: 3000 })
  })

  test('dismissing one toast leaves others visible', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__.toastStore.getState()
      store.addToast('Keep this', 'info', 0)
      store.addToast('Remove this', 'error', 0)
    })

    const toasts = mainWindow.locator('.toast')
    await expect(toasts).toHaveCount(2, { timeout: 3000 })

    // Dismiss the error toast
    const errorToast = mainWindow.locator('.toast--error')
    await errorToast.locator('.toast-dismiss').click()

    await expect(toasts).toHaveCount(1, { timeout: 3000 })

    // The info toast should still be visible
    const infoToast = mainWindow.locator('.toast--info')
    await expect(infoToast).toBeVisible()
  })

  test('toast shows severity icon', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await mainWindow.evaluate(() => {
      ;(window as any).__SMOKE_STORES__.toastStore.getState().addToast('With icon', 'success', 0)
    })

    const toast = mainWindow.locator('.toast--success')
    await expect(toast).toBeVisible({ timeout: 3000 })

    const icon = toast.locator('.toast-icon')
    await expect(icon).toBeVisible()
    // Success icon is ✔ (U+2714)
    const iconText = await icon.textContent()
    expect(iconText).toBe('\u2714')
  })

  test('terminal exit triggers toast notification', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a terminal
    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    // Wait for shell to initialize
    await mainWindow.waitForTimeout(1500)

    const sessionId = await terminalWindow.first().getAttribute('data-session-id')
    expect(sessionId).toBeTruthy()

    // Exit the shell with code 0 — should trigger a success toast
    await mainWindow.evaluate((id) => {
      window.smokeAPI.pty.write(id!, 'exit 0\n')
    }, sessionId)

    // A success toast should appear for clean exit
    const successToast = mainWindow.locator('.toast--success')
    await expect(successToast).toBeVisible({ timeout: 5000 })

    const message = successToast.locator('.toast-message')
    const text = await message.textContent()
    expect(text).toContain('exited successfully')
  })

  test('terminal error exit triggers error toast', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a terminal
    await pressShortcut(mainWindow, 'n')
    const terminalWindow = mainWindow.locator('.terminal-window')
    await expect(terminalWindow.first()).toBeVisible({ timeout: 5000 })

    // Wait for shell to initialize
    await mainWindow.waitForTimeout(1500)

    const sessionId = await terminalWindow.first().getAttribute('data-session-id')
    expect(sessionId).toBeTruthy()

    // Exit with non-zero code — should trigger an error toast
    await mainWindow.evaluate((id) => {
      window.smokeAPI.pty.write(id!, 'exit 1\n')
    }, sessionId)

    // An error toast should appear for non-zero exit
    const errorToast = mainWindow.locator('.toast--error')
    await expect(errorToast).toBeVisible({ timeout: 5000 })

    const message = errorToast.locator('.toast-message')
    const text = await message.textContent()
    expect(text).toContain('exited with code')
  })
})
