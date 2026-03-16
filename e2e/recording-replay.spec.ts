import { test, expect } from './fixtures'
import { waitForAppReady } from './helpers'

/**
 * Build a synthetic recording with the given events spread across a duration.
 * Each event gets evenly spaced timestamps starting from `baseTime`.
 */
function buildRecording(
  events: Array<{ type: string; payload: Record<string, unknown> }>,
  durationMs = 2000,
  baseTime = Date.now() - 60_000
) {
  const step = events.length > 1 ? durationMs / (events.length - 1) : 0
  return {
    version: 1,
    startedAt: baseTime,
    events: events.map((e, i) => ({
      timestamp: baseTime + i * step,
      type: e.type,
      payload: e.payload,
    })),
  }
}

/** Flush a synthetic recording to disk via IPC and return the file path. */
async function flushRecording(
  page: import('@playwright/test').Page,
  recording: ReturnType<typeof buildRecording>
): Promise<string> {
  return page.evaluate(async (rec) => {
    return await window.smokeAPI.recording.flush(rec as any)
  }, recording)
}

/** Sample events for a typical recording. */
function sampleEvents() {
  return [
    {
      type: 'session_created',
      payload: {
        sessionId: 'test-session-1',
        type: 'terminal',
        title: 'bash',
        cwd: '/tmp',
        position: { x: 100, y: 100 },
        size: { cols: 80, rows: 24, width: 640, height: 480 },
      },
    },
    {
      type: 'session_moved',
      payload: {
        sessionId: 'test-session-1',
        from: { x: 100, y: 100 },
        to: { x: 300, y: 200 },
      },
    },
    {
      type: 'viewport_changed',
      payload: { panX: 50, panY: -50, zoom: 1.5 },
    },
    {
      type: 'terminal_snapshot',
      payload: {
        sessionId: 'test-session-1',
        lines: ['$ echo hello', 'hello'],
      },
    },
    {
      type: 'session_closed',
      payload: { sessionId: 'test-session-1', exitCode: 0 },
    },
  ]
}

/** Helper: open the replay panel and start replay of a flushed recording. */
async function startReplayViaPanel(page: import('@playwright/test').Page) {
  const toggleBtn = page.locator('.replay-panel-toggle')
  await toggleBtn.click()
  await page.waitForTimeout(500)

  const firstItem = page.locator('.replay-panel-item').first()
  await expect(firstItem).toBeVisible({ timeout: 3000 })
  await firstItem.click()
  await page.waitForTimeout(500)
}

test.describe('Recording, replay, and export', () => {
  test('flush a recording to disk and list it', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents())
    const filePath = await flushRecording(mainWindow, recording)
    expect(filePath).toBeTruthy()
    expect(filePath).toContain('recording-')

    // List recordings — our flushed recording should appear
    const list = await mainWindow.evaluate(async () => {
      return await window.smokeAPI.recording.list()
    })
    expect(list.length).toBeGreaterThanOrEqual(1)

    const entry = list.find((r: any) => filePath.includes(r.filename))
    expect(entry).toBeTruthy()
    expect(entry!.eventCount).toBe(5)
    expect(entry!.durationMs).toBeGreaterThan(0)
  })

  test('load a saved recording and start replay via store', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents(), 3000)
    await flushRecording(mainWindow, recording)

    // List and get the filename
    const list = await mainWindow.evaluate(async () => {
      return await window.smokeAPI.recording.list()
    })
    expect(list.length).toBeGreaterThanOrEqual(1)
    const filename = list[list.length - 1].filename

    // Load the recording via IPC
    const loaded = await mainWindow.evaluate(async (fn: string) => {
      return await window.smokeAPI.recording.load(fn)
    }, filename)
    expect(loaded).toBeTruthy()
    expect(loaded!.events.length).toBe(5)

    // Start replay via the store
    await mainWindow.evaluate((data: any) => {
      const store = (window as any).__SMOKE_STORES__?.replayStore
      if (store) {
        store.getState().startReplay(data.events)
      }
    }, loaded)

    // Check replay state is active
    const replayState = await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__?.replayStore
      if (!store) return null
      const s = store.getState()
      return { active: s.active, playing: s.playing, eventCount: s.events.length, duration: s.duration }
    })

    expect(replayState).toBeTruthy()
    expect(replayState!.active).toBe(true)
    expect(replayState!.eventCount).toBe(5)
    expect(replayState!.duration).toBeGreaterThan(0)
  })

  test('replay panel toggle shows recording list with items', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Flush a recording first
    const recording = buildRecording(sampleEvents())
    await flushRecording(mainWindow, recording)

    // Click the Recordings toggle button
    const toggleBtn = mainWindow.locator('.replay-panel-toggle')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(500)

    // Panel content should be visible
    const panelContent = mainWindow.locator('.replay-panel-content')
    await expect(panelContent).toBeVisible({ timeout: 3000 })

    // Should show at least one recording item
    const items = mainWindow.locator('.replay-panel-item')
    await expect(items.first()).toBeVisible({ timeout: 3000 })

    // Each item should have an Export button
    const exportBtns = mainWindow.locator('.replay-panel-export-btn')
    expect(await exportBtns.count()).toBeGreaterThanOrEqual(1)
  })

  test('click a recording in panel starts replay and shows controls', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents(), 5000)
    await flushRecording(mainWindow, recording)

    await startReplayViaPanel(mainWindow)

    // Replay controls bar should appear
    const controls = mainWindow.locator('.replay-controls')
    await expect(controls).toBeVisible({ timeout: 3000 })

    // Should show REPLAY label
    const label = mainWindow.locator('.replay-label')
    await expect(label).toHaveText('REPLAY')

    // Should show event count
    const eventCount = mainWindow.locator('.replay-event-count')
    await expect(eventCount).toBeVisible()
    const text = await eventCount.textContent()
    expect(text).toContain('/5 events')

    // Time display should be visible
    const timeDisplay = mainWindow.locator('.replay-time')
    await expect(timeDisplay).toBeVisible()
  })

  test('play/pause controls toggle playback state', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents(), 10000)
    await flushRecording(mainWindow, recording)

    await startReplayViaPanel(mainWindow)

    // The replay should be playing (auto-play on load)
    const playBtn = mainWindow.locator('.replay-btn-play')
    await expect(playBtn).toBeVisible({ timeout: 3000 })

    // Check that it's playing (button shows pause icon)
    let btnText = await playBtn.textContent()
    expect(btnText?.trim()).toBe('\u23F8') // pause icon = playing

    // Click to pause
    await playBtn.click()
    await mainWindow.waitForTimeout(200)

    // Verify state changed to paused
    btnText = await playBtn.textContent()
    expect(btnText?.trim()).toBe('\u25B6') // play icon = paused

    // Click to resume
    await playBtn.click()
    await mainWindow.waitForTimeout(200)

    btnText = await playBtn.textContent()
    expect(btnText?.trim()).toBe('\u23F8') // pause icon = playing again
  })

  test('stop button ends replay and hides controls', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents(), 10000)
    await flushRecording(mainWindow, recording)

    await startReplayViaPanel(mainWindow)

    // Replay controls should be visible
    await expect(mainWindow.locator('.replay-controls')).toBeVisible({ timeout: 3000 })

    // Click stop
    const stopBtn = mainWindow.locator('.replay-btn-stop')
    await stopBtn.click()
    await mainWindow.waitForTimeout(500)

    // Controls should disappear (replay ended)
    await expect(mainWindow.locator('.replay-controls')).toHaveCount(0, { timeout: 3000 })

    // Replay store should be inactive
    const state = await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__?.replayStore
      return store ? store.getState().active : null
    })
    expect(state).toBe(false)
  })

  test('speed button cycles through 1x, 2x, 4x, 0.5x', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents(), 10000)
    await flushRecording(mainWindow, recording)

    await startReplayViaPanel(mainWindow)

    // Pause playback first to avoid timing issues
    const playBtn = mainWindow.locator('.replay-btn-play')
    await playBtn.click()
    await mainWindow.waitForTimeout(100)

    const speedBtn = mainWindow.locator('.replay-btn-speed')
    await expect(speedBtn).toBeVisible({ timeout: 3000 })

    // Default speed should be 1x
    let speedText = await speedBtn.textContent()
    expect(speedText?.trim()).toBe('1x')

    // Click to cycle: 1x -> 2x
    await speedBtn.click()
    await mainWindow.waitForTimeout(100)
    speedText = await speedBtn.textContent()
    expect(speedText?.trim()).toBe('2x')

    // Click: 2x -> 4x
    await speedBtn.click()
    await mainWindow.waitForTimeout(100)
    speedText = await speedBtn.textContent()
    expect(speedText?.trim()).toBe('4x')

    // Click: 4x -> 0.5x
    await speedBtn.click()
    await mainWindow.waitForTimeout(100)
    speedText = await speedBtn.textContent()
    expect(speedText?.trim()).toBe('0.5x')

    // Click: 0.5x -> 1x (wraps around)
    await speedBtn.click()
    await mainWindow.waitForTimeout(100)
    speedText = await speedBtn.textContent()
    expect(speedText?.trim()).toBe('1x')
  })

  test('timeline scrubber seek updates position and event index', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Build a recording with well-spaced events
    const recording = buildRecording(sampleEvents(), 10000)
    await flushRecording(mainWindow, recording)

    await startReplayViaPanel(mainWindow)

    // Pause playback for precise seek testing
    const playBtn = mainWindow.locator('.replay-btn-play')
    await playBtn.click()
    await mainWindow.waitForTimeout(100)

    // Click near the middle of the scrubber bar
    const scrubber = mainWindow.locator('.replay-scrubber')
    await expect(scrubber).toBeVisible({ timeout: 3000 })

    const box = await scrubber.boundingBox()
    expect(box).toBeTruthy()

    // Click at ~50% of the scrubber width
    await scrubber.click({ position: { x: box!.width * 0.5, y: box!.height / 2 } })
    await mainWindow.waitForTimeout(300)

    // Verify scrubber fill has moved (roughly to 50%)
    const fill = mainWindow.locator('.replay-scrubber-fill')
    const fillStyle = await fill.getAttribute('style')
    expect(fillStyle).toBeTruthy()
    const widthMatch = fillStyle!.match(/width:\s*([\d.]+)%/)
    expect(widthMatch).toBeTruthy()
    const widthPercent = parseFloat(widthMatch![1])
    // Should be roughly around 50% (with tolerance for click positioning)
    expect(widthPercent).toBeGreaterThan(20)
    expect(widthPercent).toBeLessThan(80)

    // Verify replay state reflects the seek
    const state = await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__?.replayStore
      if (!store) return null
      const s = store.getState()
      return { currentTime: s.currentTime, duration: s.duration, currentIndex: s.currentIndex }
    })
    expect(state).toBeTruthy()
    expect(state!.currentTime).toBeGreaterThan(0)
    expect(state!.currentTime).toBeLessThan(state!.duration)
    expect(state!.currentIndex).toBeGreaterThan(0)
  })

  test('replay panel shows action buttons (replay current, import)', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open the recordings panel
    const toggleBtn = mainWindow.locator('.replay-panel-toggle')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(500)

    // Panel content should be visible
    const panelContent = mainWindow.locator('.replay-panel-content')
    await expect(panelContent).toBeVisible({ timeout: 3000 })

    // The "Replay current session" button should be visible
    const replayCurrentBtn = mainWindow.locator('.replay-panel-action', { hasText: 'Replay current session' })
    await expect(replayCurrentBtn).toBeVisible()

    // The "Import recording" button should be visible
    const importBtn = mainWindow.locator('.replay-panel-action', { hasText: 'Import recording' })
    await expect(importBtn).toBeVisible()
  })

  test('replay time display shows correct format and duration', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents(), 5000)
    await flushRecording(mainWindow, recording)

    await startReplayViaPanel(mainWindow)

    // Get time display
    const timeDisplay = mainWindow.locator('.replay-time')
    await expect(timeDisplay).toBeVisible({ timeout: 3000 })
    const timeText = await timeDisplay.textContent()

    // Should show format like "M:SS / M:SS"
    expect(timeText).toMatch(/\d+:\d{2}\s*\/\s*\d+:\d{2}/)

    // The total duration should reflect our 5-second recording
    expect(timeText).toContain('0:05')
  })

  test('replay hides panel and shows controls in active mode', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents(), 10000)
    await flushRecording(mainWindow, recording)

    await startReplayViaPanel(mainWindow)

    // Replay controls should be visible
    await expect(mainWindow.locator('.replay-controls')).toBeVisible({ timeout: 3000 })

    // The replay panel should be hidden during replay (isReplaying check)
    // ReplayPanel returns <></> when isReplaying is true
    const panelToggle = mainWindow.locator('.replay-panel-toggle')
    await expect(panelToggle).toHaveCount(0, { timeout: 3000 })

    // Check replay is active via store
    const isActive = await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__?.replayStore
      return store ? store.getState().active : false
    })
    expect(isActive).toBe(true)
  })

  test('collapsing and re-expanding replay panel refreshes list', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Open panel first
    const toggleBtn = mainWindow.locator('.replay-panel-toggle')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(500)

    // Get initial count
    const initialCount = await mainWindow.locator('.replay-panel-item').count()

    // Collapse
    await toggleBtn.click()
    await mainWindow.waitForTimeout(200)

    // Flush a new recording while collapsed
    const recording = buildRecording(sampleEvents())
    await flushRecording(mainWindow, recording)

    // Re-expand
    await toggleBtn.click()
    await mainWindow.waitForTimeout(500)

    // Should now show more recordings
    const newCount = await mainWindow.locator('.replay-panel-item').count()
    expect(newCount).toBeGreaterThan(initialCount)
  })

  test('recording items show date, event count, and duration', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents(), 5000)
    await flushRecording(mainWindow, recording)

    // Open panel
    const toggleBtn = mainWindow.locator('.replay-panel-toggle')
    await toggleBtn.click()

    // Wait for panel content to be visible (async IPC list fetch)
    const panelContent = mainWindow.locator('.replay-panel-content')
    await expect(panelContent).toBeVisible({ timeout: 5000 })

    // Wait for panel items to render (recordings are loaded asynchronously)
    const items = mainWindow.locator('.replay-panel-item-row')
    await expect(items.first()).toBeVisible({ timeout: 5000 })

    // Find a recording row that contains our "5 events" and "5s" meta text
    // (there may be items from other tests in this run, so we can't rely on .last())
    const targetRow = mainWindow.locator('.replay-panel-item-row', { hasText: '5 events' })
      .filter({ hasText: '5s' })
      .first()
    await expect(targetRow).toBeVisible({ timeout: 5000 })

    // Check date is displayed
    const dateText = targetRow.locator('.replay-panel-item-date')
    await expect(dateText).toBeVisible()
    const dateContent = await dateText.textContent()
    expect(dateContent).toBeTruthy()
    expect(dateContent!.length).toBeGreaterThan(0)

    // Check meta shows event count and duration
    const metaText = targetRow.locator('.replay-panel-item-meta')
    await expect(metaText).toBeVisible()
    const metaContent = await metaText.textContent()
    expect(metaContent).toContain('5 events')
    expect(metaContent).toContain('5s')
  })

  test('export button is present for each recording item', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    const recording = buildRecording(sampleEvents())
    await flushRecording(mainWindow, recording)

    // Open panel
    const toggleBtn = mainWindow.locator('.replay-panel-toggle')
    await toggleBtn.click()
    await mainWindow.waitForTimeout(500)

    // Each recording row should have an Export button
    const exportBtns = mainWindow.locator('.replay-panel-export-btn')
    const count = await exportBtns.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // Export button text should say "Export"
    const firstExportBtn = exportBtns.first()
    await expect(firstExportBtn).toHaveText('Export')
  })

  test('replay completes and auto-pauses at end of recording', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Short recording that will complete quickly
    const events = [
      {
        type: 'viewport_changed',
        payload: { panX: 100, panY: 0, zoom: 1 },
      },
    ]
    const recording = buildRecording(events, 500)
    await flushRecording(mainWindow, recording)

    await startReplayViaPanel(mainWindow)

    // Wait for the short recording to complete
    await mainWindow.waitForTimeout(2000)

    // After completion, the replay should have auto-paused
    const state = await mainWindow.evaluate(() => {
      const store = (window as any).__SMOKE_STORES__?.replayStore
      if (!store) return null
      const s = store.getState()
      return { active: s.active, playing: s.playing, currentTime: s.currentTime, duration: s.duration }
    })

    expect(state).toBeTruthy()
    // Replay should still be active (not stopped, just paused at end)
    expect(state!.active).toBe(true)
    expect(state!.playing).toBe(false)
    // Current time should be at or near the end
    expect(state!.currentTime).toBeGreaterThanOrEqual(state!.duration * 0.9)
  })
})
