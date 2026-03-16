import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut, evaluate } from './helpers'

test.describe('Context Assembly: Task Input', () => {
  test('Cmd+Shift+A opens the task input modal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Task input should not be visible initially
    await expect(mainWindow.locator('.task-input-backdrop')).toHaveCount(0)

    // Open task input via keyboard shortcut
    await pressShortcut(mainWindow, 'a', { shift: true })

    // Modal should appear
    const modal = mainWindow.locator('.task-input-modal')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Title should be present
    await expect(modal.locator('.task-input-title')).toHaveText('Assemble Workspace')

    // Textarea should be focused
    const textarea = modal.locator('.task-input-field')
    await expect(textarea).toBeVisible()
    await expect(textarea).toBeFocused({ timeout: 2000 })
  })

  test('task input store state updates when opened', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Verify store shows closed
    const before = await evaluate(mainWindow, () => {
      return (window as any).__SMOKE_STORES__.taskInputStore.getState().isOpen
    })
    expect(before).toBe(false)

    // Open via shortcut
    await pressShortcut(mainWindow, 'a', { shift: true })

    // Store should now show open
    const after = await evaluate(mainWindow, () => {
      return (window as any).__SMOKE_STORES__.taskInputStore.getState().isOpen
    })
    expect(after).toBe(true)
  })

  test('typing in task input updates the query', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await pressShortcut(mainWindow, 'a', { shift: true })

    const textarea = mainWindow.locator('.task-input-field')
    await expect(textarea).toBeVisible({ timeout: 5000 })

    await textarea.fill('Fix the auth middleware timeout bug')

    // Verify store has the query
    const query = await evaluate(mainWindow, () => {
      return (window as any).__SMOKE_STORES__.taskInputStore.getState().query
    })
    expect(query).toBe('Fix the auth middleware timeout bug')
  })

  test('Escape closes the task input modal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await pressShortcut(mainWindow, 'a', { shift: true })

    await expect(mainWindow.locator('.task-input-modal')).toBeVisible({ timeout: 5000 })

    // Press Escape
    await mainWindow.keyboard.press('Escape')

    // Modal should disappear
    await expect(mainWindow.locator('.task-input-backdrop')).toHaveCount(0, { timeout: 5000 })

    // Store should reflect closed state
    const isOpen = await evaluate(mainWindow, () => {
      return (window as any).__SMOKE_STORES__.taskInputStore.getState().isOpen
    })
    expect(isOpen).toBe(false)
  })

  test('Cancel button closes the task input modal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await pressShortcut(mainWindow, 'a', { shift: true })

    await expect(mainWindow.locator('.task-input-modal')).toBeVisible({ timeout: 5000 })

    await mainWindow.locator('.task-input-cancel-btn').click()

    await expect(mainWindow.locator('.task-input-backdrop')).toHaveCount(0, { timeout: 5000 })
  })

  test('close button (×) closes the modal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await pressShortcut(mainWindow, 'a', { shift: true })

    await expect(mainWindow.locator('.task-input-modal')).toBeVisible({ timeout: 5000 })

    await mainWindow.locator('.task-input-close-btn').click()

    await expect(mainWindow.locator('.task-input-backdrop')).toHaveCount(0, { timeout: 5000 })
  })

  test('Assemble button is disabled when input is empty', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await pressShortcut(mainWindow, 'a', { shift: true })

    const submitBtn = mainWindow.locator('.task-input-submit-btn')
    await expect(submitBtn).toBeVisible({ timeout: 5000 })
    await expect(submitBtn).toBeDisabled()

    // Type something — button should become enabled
    const textarea = mainWindow.locator('.task-input-field')
    await textarea.fill('Some task')
    await expect(submitBtn).toBeEnabled()

    // Clear — button should be disabled again
    await textarea.fill('')
    await expect(submitBtn).toBeDisabled()
  })
})

test.describe('Context Assembly: Phase Progress', () => {
  test('submitting a task shows phase progress indicators', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await pressShortcut(mainWindow, 'a', { shift: true })

    const textarea = mainWindow.locator('.task-input-field')
    await expect(textarea).toBeVisible({ timeout: 5000 })

    // Manipulate the store to simulate phases directly (since context.collect
    // requires a real project and IPC that may not be available in test env).
    // We set loading + phase to verify the UI renders progress correctly.
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ loading: true, phase: 'indexing' })
    })

    // Progress bar should be visible
    const progress = mainWindow.locator('.task-input-progress')
    await expect(progress).toBeVisible({ timeout: 5000 })

    // Phase labels should be visible
    const phases = mainWindow.locator('.task-input-phase')
    await expect(phases).toHaveCount(4)

    // The "indexing" phase should be active
    const activePhase = mainWindow.locator('.task-input-phase.active')
    await expect(activePhase).toContainText('Indexing codebase')

    // Advance to "searching"
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ phase: 'searching' })
    })

    // The first phase should now be done (with checkmark)
    const donePhase = mainWindow.locator('.task-input-phase.done')
    await expect(donePhase.first()).toBeVisible()

    // Active should now be searching
    const searchActive = mainWindow.locator('.task-input-phase.active')
    await expect(searchActive).toContainText('Searching for relevant files')

    // Advance to "scoring"
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ phase: 'scoring' })
    })

    const scoringActive = mainWindow.locator('.task-input-phase.active')
    await expect(scoringActive).toContainText('Scoring relevance')

    // Two phases should be done now
    await expect(mainWindow.locator('.task-input-phase.done')).toHaveCount(2)

    // Advance to "assembling"
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ phase: 'assembling' })
    })

    const assemblingActive = mainWindow.locator('.task-input-phase.active')
    await expect(assemblingActive).toContainText('Assembling workspace')
    await expect(mainWindow.locator('.task-input-phase.done')).toHaveCount(3)
  })

  test('progress bar width increases with each phase', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await pressShortcut(mainWindow, 'a', { shift: true })
    await expect(mainWindow.locator('.task-input-modal')).toBeVisible({ timeout: 5000 })

    // Set to indexing phase (phase 1 of 4 = 25%)
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ loading: true, phase: 'indexing' })
    })

    const fill = mainWindow.locator('.task-input-progress-fill')
    await expect(fill).toBeVisible({ timeout: 3000 })

    const width1 = await fill.evaluate((el) => el.style.width)
    expect(width1).toBe('25%')

    // Advance to searching (50%)
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ phase: 'searching' })
    })

    const width2 = await fill.evaluate((el) => el.style.width)
    expect(width2).toBe('50%')

    // Advance to scoring (75%)
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ phase: 'scoring' })
    })

    const width3 = await fill.evaluate((el) => el.style.width)
    expect(width3).toBe('75%')

    // Advance to assembling (100%)
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ phase: 'assembling' })
    })

    const width4 = await fill.evaluate((el) => el.style.width)
    expect(width4).toBe('100%')
  })

  test('textarea and buttons are disabled during loading', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await pressShortcut(mainWindow, 'a', { shift: true })
    await expect(mainWindow.locator('.task-input-modal')).toBeVisible({ timeout: 5000 })

    // Set loading state
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ loading: true, phase: 'indexing', query: 'some task' })
    })

    const textarea = mainWindow.locator('.task-input-field')
    await expect(textarea).toBeDisabled()

    const cancelBtn = mainWindow.locator('.task-input-cancel-btn')
    await expect(cancelBtn).toBeDisabled()

    // Submit button should show "Assembling..." text
    const submitBtn = mainWindow.locator('.task-input-submit-btn')
    await expect(submitBtn).toBeDisabled()
    await expect(submitBtn).toHaveText('Assembling...')

    // Footer hint should show "Processing..."
    const hint = mainWindow.locator('.task-input-footer-hint')
    await expect(hint).toHaveText('Processing...')
  })
})

test.describe('Context Assembly: Assembly Preview', () => {
  test('assembly preview shows candidate files after context collection', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Directly populate the assembly preview store with mock data
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.assemblyPreviewStore
      store.getState().showPreview(
        {
          files: [
            {
              filePath: '/project/src/auth/middleware.ts',
              relevance: 0.92,
              imports: ['/project/src/auth/token.ts'],
              importedBy: ['/project/src/server.ts'],
              source: 'search',
              moduleId: 'auth',
            },
            {
              filePath: '/project/src/auth/token.ts',
              relevance: 0.78,
              imports: [],
              importedBy: ['/project/src/auth/middleware.ts'],
              source: 'import-graph',
              moduleId: 'auth',
            },
            {
              filePath: '/project/src/server.ts',
              relevance: 0.45,
              imports: ['/project/src/auth/middleware.ts'],
              importedBy: [],
              source: 'import-graph',
            },
          ],
          parsedTask: {
            intent: 'fix',
            keywords: ['auth', 'middleware', 'timeout'],
            filePatterns: [],
            includeFileTypes: ['source'],
            usedAi: false,
          },
          structureMap: null,
          timing: { parse: 5, search: 100, structure: 50, graph: 80, scoring: 30, total: 265 },
        },
        '/project',
        'Fix the auth middleware timeout bug'
      )
    })

    // Assembly preview modal should be visible
    const modal = mainWindow.locator('.assembly-modal')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Title should be "Workspace Preview"
    await expect(modal.locator('.assembly-title')).toHaveText('Workspace Preview')

    // Task description should be displayed with intent tag
    const taskDesc = modal.locator('.assembly-task-desc')
    await expect(taskDesc).toContainText('Fix the auth middleware timeout bug')
    const intentTag = modal.locator('.assembly-task-intent')
    await expect(intentTag).toHaveText('fix')

    // File rows should be displayed
    const fileRows = mainWindow.locator('.assembly-file-row')
    await expect(fileRows).toHaveCount(3)

    // Verify file names are shown
    const fileNames = mainWindow.locator('.assembly-file-name')
    const names = await fileNames.allTextContents()
    expect(names).toContain('middleware.ts')
    expect(names).toContain('token.ts')
    expect(names).toContain('server.ts')

    // Verify relative paths are shown
    const filePaths = mainWindow.locator('.assembly-file-path')
    const paths = await filePaths.allTextContents()
    expect(paths).toContain('src/auth/middleware.ts')

    // Verify relevance scores are shown
    const relevanceLabels = mainWindow.locator('.assembly-relevance')
    const scores = await relevanceLabels.allTextContents()
    expect(scores).toContain('92%')
    expect(scores).toContain('78%')
    expect(scores).toContain('45%')

    // Verify source tags are shown
    const sourceTags = mainWindow.locator('.assembly-source-tag')
    const sources = await sourceTags.allTextContents()
    expect(sources).toContain('search')
    expect(sources).toContain('import-graph')

    // Count indicator should show all selected
    const countText = mainWindow.locator('.assembly-count')
    await expect(countText).toHaveText('3 of 3 selected')
  })

  test('files are grouped by module', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.assemblyPreviewStore
      store.getState().showPreview(
        {
          files: [
            {
              filePath: '/project/src/auth/login.ts',
              relevance: 0.9,
              imports: [],
              importedBy: [],
              source: 'search',
              moduleId: 'auth',
            },
            {
              filePath: '/project/src/db/connection.ts',
              relevance: 0.6,
              imports: [],
              importedBy: [],
              source: 'search',
              moduleId: 'database',
            },
            {
              filePath: '/project/src/utils.ts',
              relevance: 0.3,
              imports: [],
              importedBy: [],
              source: 'search',
            },
          ],
          parsedTask: {
            intent: 'investigate',
            keywords: ['auth'],
            filePatterns: [],
            includeFileTypes: ['source'],
            usedAi: false,
          },
          structureMap: null,
          timing: { parse: 1, search: 10, structure: 5, graph: 5, scoring: 5, total: 26 },
        },
        '/project',
        'Investigate auth flow'
      )
    })

    await expect(mainWindow.locator('.assembly-modal')).toBeVisible({ timeout: 5000 })

    // Should have 3 groups: auth, database, Other
    const groupHeaders = mainWindow.locator('.assembly-group-header')
    const headers = await groupHeaders.allTextContents()
    expect(headers).toContain('auth')
    expect(headers).toContain('database')
    expect(headers).toContain('Other')
  })

  test('toggling file selection updates checkboxes and count', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.assemblyPreviewStore
      store.getState().showPreview(
        {
          files: [
            {
              filePath: '/project/a.ts',
              relevance: 0.9,
              imports: [],
              importedBy: [],
              source: 'search',
            },
            {
              filePath: '/project/b.ts',
              relevance: 0.5,
              imports: [],
              importedBy: [],
              source: 'search',
            },
          ],
          parsedTask: {
            intent: 'fix',
            keywords: [],
            filePatterns: [],
            includeFileTypes: ['source'],
            usedAi: false,
          },
          structureMap: null,
          timing: { parse: 1, search: 5, structure: 0, graph: 0, scoring: 1, total: 7 },
        },
        '/project',
        'Fix something'
      )
    })

    await expect(mainWindow.locator('.assembly-modal')).toBeVisible({ timeout: 5000 })

    // Initially both selected
    await expect(mainWindow.locator('.assembly-count')).toHaveText('2 of 2 selected')

    // Click the first file row to deselect it
    const fileRows = mainWindow.locator('.assembly-file-row')
    await fileRows.first().click()

    await expect(mainWindow.locator('.assembly-count')).toHaveText('1 of 2 selected')

    // First checkbox should be unchecked
    const firstCheckbox = fileRows.first().locator('.assembly-file-checkbox')
    await expect(firstCheckbox).not.toBeChecked()

    // Click again to re-select
    await fileRows.first().click()
    await expect(mainWindow.locator('.assembly-count')).toHaveText('2 of 2 selected')
    await expect(firstCheckbox).toBeChecked()
  })

  test('Select All / Deselect All toolbar buttons work', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.assemblyPreviewStore
      store.getState().showPreview(
        {
          files: [
            { filePath: '/p/a.ts', relevance: 0.9, imports: [], importedBy: [], source: 'search' },
            { filePath: '/p/b.ts', relevance: 0.5, imports: [], importedBy: [], source: 'search' },
            { filePath: '/p/c.ts', relevance: 0.3, imports: [], importedBy: [], source: 'search' },
          ],
          parsedTask: { intent: 'fix', keywords: [], filePatterns: [], includeFileTypes: ['source'], usedAi: false },
          structureMap: null,
          timing: { parse: 1, search: 5, structure: 0, graph: 0, scoring: 1, total: 7 },
        },
        '/p',
        'Fix something'
      )
    })

    await expect(mainWindow.locator('.assembly-modal')).toBeVisible({ timeout: 5000 })
    await expect(mainWindow.locator('.assembly-count')).toHaveText('3 of 3 selected')

    // Click "Deselect all"
    await mainWindow.locator('.assembly-toolbar-btn', { hasText: 'Deselect all' }).click()
    await expect(mainWindow.locator('.assembly-count')).toHaveText('0 of 3 selected')

    // Confirm button should be disabled with no files selected
    await expect(mainWindow.locator('.assembly-confirm-btn')).toBeDisabled()

    // Click "Select all"
    await mainWindow.locator('.assembly-toolbar-btn', { hasText: 'Select all' }).click()
    await expect(mainWindow.locator('.assembly-count')).toHaveText('3 of 3 selected')

    // Confirm button should be enabled
    await expect(mainWindow.locator('.assembly-confirm-btn')).toBeEnabled()
  })

  test('confirm button dispatches assembly:confirm event and closes modal', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.assemblyPreviewStore
      store.getState().showPreview(
        {
          files: [
            { filePath: '/project/src/main.ts', relevance: 0.85, imports: [], importedBy: [], source: 'search' },
          ],
          parsedTask: { intent: 'fix', keywords: [], filePatterns: [], includeFileTypes: ['source'], usedAi: false },
          structureMap: null,
          timing: { parse: 1, search: 5, structure: 0, graph: 0, scoring: 1, total: 7 },
        },
        '/project',
        'Fix main entry'
      )
    })

    await expect(mainWindow.locator('.assembly-modal')).toBeVisible({ timeout: 5000 })

    // Set up event listener to capture the assembly:confirm event
    await evaluate(mainWindow, () => {
      ;(window as any).__assemblyConfirmEvent = null
      window.addEventListener('assembly:confirm', ((e: CustomEvent) => {
        ;(window as any).__assemblyConfirmEvent = e.detail
      }) as EventListener, { once: true })
    })

    // Click confirm
    const confirmBtn = mainWindow.locator('.assembly-confirm-btn')
    await expect(confirmBtn).toHaveText('Open 1 file')
    await confirmBtn.click()

    // Modal should close
    await expect(mainWindow.locator('.assembly-backdrop')).toHaveCount(0, { timeout: 5000 })

    // Verify the event was dispatched with correct data
    const eventDetail = await evaluate(mainWindow, () => {
      return (window as any).__assemblyConfirmEvent
    })
    expect(eventDetail).not.toBeNull()
    expect(eventDetail.files).toHaveLength(1)
    expect(eventDetail.files[0].filePath).toBe('/project/src/main.ts')
    expect(eventDetail.projectRoot).toBe('/project')
  })

  test('Escape closes the assembly preview', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.assemblyPreviewStore
      store.getState().showPreview(
        {
          files: [
            { filePath: '/p/x.ts', relevance: 0.5, imports: [], importedBy: [], source: 'search' },
          ],
          parsedTask: { intent: 'fix', keywords: [], filePatterns: [], includeFileTypes: ['source'], usedAi: false },
          structureMap: null,
          timing: { parse: 1, search: 5, structure: 0, graph: 0, scoring: 1, total: 7 },
        },
        '/p',
        'Test'
      )
    })

    await expect(mainWindow.locator('.assembly-modal')).toBeVisible({ timeout: 5000 })

    await mainWindow.keyboard.press('Escape')

    await expect(mainWindow.locator('.assembly-backdrop')).toHaveCount(0, { timeout: 5000 })

    // Store should reflect closed
    const isOpen = await evaluate(mainWindow, () => {
      return (window as any).__SMOKE_STORES__.assemblyPreviewStore.getState().isOpen
    })
    expect(isOpen).toBe(false)
  })

  test('removing a file updates the list', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.assemblyPreviewStore
      store.getState().showPreview(
        {
          files: [
            { filePath: '/p/a.ts', relevance: 0.9, imports: [], importedBy: [], source: 'search' },
            { filePath: '/p/b.ts', relevance: 0.5, imports: [], importedBy: [], source: 'search' },
          ],
          parsedTask: { intent: 'fix', keywords: [], filePatterns: [], includeFileTypes: ['source'], usedAi: false },
          structureMap: null,
          timing: { parse: 1, search: 5, structure: 0, graph: 0, scoring: 1, total: 7 },
        },
        '/p',
        'Fix'
      )
    })

    await expect(mainWindow.locator('.assembly-modal')).toBeVisible({ timeout: 5000 })
    await expect(mainWindow.locator('.assembly-file-row')).toHaveCount(2)

    // Click the remove button on the first file
    const removeBtn = mainWindow.locator('.assembly-remove-btn').first()
    await removeBtn.click()

    await expect(mainWindow.locator('.assembly-file-row')).toHaveCount(1)
    await expect(mainWindow.locator('.assembly-count')).toHaveText('1 of 1 selected')
  })
})

test.describe('Context Assembly: Task History', () => {
  test('task history is displayed and clickable', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Inject task history into the store
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({
        history: [
          { description: 'Fix the auth bug', timestamp: 1000 },
          { description: 'Add new feature', timestamp: 2000 },
          { description: 'Refactor database layer', timestamp: 3000 },
        ],
      })
    })

    // Open task input
    await pressShortcut(mainWindow, 'a', { shift: true })
    await expect(mainWindow.locator('.task-input-modal')).toBeVisible({ timeout: 5000 })

    // History section should be visible
    const historySection = mainWindow.locator('.task-input-history')
    await expect(historySection).toBeVisible()

    // Should have 3 history items
    const historyItems = mainWindow.locator('.task-input-history-item')
    await expect(historyItems).toHaveCount(3)

    // "Recent tasks" header should be shown
    await expect(mainWindow.locator('.task-input-history-title')).toHaveText('Recent tasks')

    // Click a history item to populate the textarea
    await historyItems.first().click()

    const query = await evaluate(mainWindow, () => {
      return (window as any).__SMOKE_STORES__.taskInputStore.getState().query
    })
    expect(query).toBe('Fix the auth bug')
  })

  test('individual history entries can be removed', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({
        history: [
          { description: 'Task A', timestamp: 1000 },
          { description: 'Task B', timestamp: 2000 },
        ],
      })
    })

    await pressShortcut(mainWindow, 'a', { shift: true })
    await expect(mainWindow.locator('.task-input-modal')).toBeVisible({ timeout: 5000 })

    await expect(mainWindow.locator('.task-input-history-item')).toHaveCount(2)

    // Click the remove button on the first item
    const removeBtn = mainWindow.locator('.task-input-history-remove').first()
    await removeBtn.click()

    await expect(mainWindow.locator('.task-input-history-item')).toHaveCount(1)

    // Verify remaining item is "Task B"
    const remainingText = await mainWindow.locator('.task-input-history-text').first().textContent()
    expect(remainingText).toBe('Task B')
  })

  test('Clear button removes all history entries', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({
        history: [
          { description: 'Task A', timestamp: 1000 },
          { description: 'Task B', timestamp: 2000 },
          { description: 'Task C', timestamp: 3000 },
        ],
      })
    })

    await pressShortcut(mainWindow, 'a', { shift: true })
    await expect(mainWindow.locator('.task-input-modal')).toBeVisible({ timeout: 5000 })

    await expect(mainWindow.locator('.task-input-history-item')).toHaveCount(3)

    // Click Clear button
    await mainWindow.locator('.task-input-history-clear').click()

    // History section should disappear (HistoryList returns null when empty)
    await expect(mainWindow.locator('.task-input-history')).toHaveCount(0, { timeout: 3000 })
  })

  test('history is hidden during loading', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({
        history: [
          { description: 'Task A', timestamp: 1000 },
        ],
      })
    })

    await pressShortcut(mainWindow, 'a', { shift: true })
    await expect(mainWindow.locator('.task-input-modal')).toBeVisible({ timeout: 5000 })

    // History should be visible when not loading
    await expect(mainWindow.locator('.task-input-history')).toBeVisible()

    // Set loading state
    await evaluate(mainWindow, () => {
      const store = (window as any).__SMOKE_STORES__.taskInputStore
      store.setState({ loading: true, phase: 'indexing' })
    })

    // History should be hidden during loading
    await expect(mainWindow.locator('.task-input-history')).toHaveCount(0, { timeout: 3000 })

    // Phase progress should show instead
    await expect(mainWindow.locator('.task-input-progress')).toBeVisible()
  })
})
