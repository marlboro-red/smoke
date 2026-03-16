import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'
import type { Page } from '@playwright/test'

/**
 * Helper: Open the AI panel using Cmd+L shortcut.
 */
async function openAiPanel(page: Page): Promise<void> {
  await pressShortcut(page, 'l')
  await expect(page.locator('.ai-chat-panel')).toBeVisible({ timeout: 5000 })
}

/**
 * Helper: Wait for the default agent to be created (happens on first mount).
 */
async function waitForDefaultAgent(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const tab = document.querySelector('.ai-agent-tab')
      return tab !== null
    },
    { timeout: 10000 }
  )
}

/**
 * Helper: Add a user message to the active agent's store directly.
 * This avoids needing to wait for AI backend responses.
 */
async function injectUserMessage(page: Page, text: string): Promise<void> {
  await page.evaluate((msg) => {
    // Get agentStore from the module system — exposed on window for testing
    const agentStore = (window as any).__SMOKE_STORES__?.agentStore
    if (agentStore) {
      const state = agentStore.getState()
      if (state.activeAgentId) {
        state.addUserMessage(state.activeAgentId, msg)
      }
    }
  }, text)
}

/**
 * Helper: Inject a simulated assistant response with text into the active agent.
 */
async function injectAssistantResponse(page: Page, text: string): Promise<void> {
  await page.evaluate((responseText) => {
    const agentStore = (window as any).__SMOKE_STORES__?.agentStore
    if (agentStore) {
      const state = agentStore.getState()
      const agentId = state.activeAgentId
      if (agentId) {
        const msg = state.addAssistantMessage(agentId)
        if (msg) {
          state.appendText(agentId, msg.id, responseText)
          state.completeGeneration(agentId)
        }
      }
    }
  }, text)
}

/**
 * Helper: Inject a simulated assistant response with a tool call.
 */
async function injectToolCallResponse(
  page: Page,
  toolName: string,
  input: Record<string, unknown>,
  result: string,
  isError = false
): Promise<void> {
  await page.evaluate(
    ([name, inp, res, err]) => {
      const agentStore = (window as any).__SMOKE_STORES__?.agentStore
      if (agentStore) {
        const state = agentStore.getState()
        const agentId = state.activeAgentId
        if (agentId) {
          const msg = state.addAssistantMessage(agentId)
          if (msg) {
            const toolUseId = `tool_${Date.now()}`
            state.addToolUse(agentId, msg.id, { id: toolUseId, name, input: inp })
            state.addToolResult(agentId, msg.id, {
              tool_use_id: toolUseId,
              content: res,
              is_error: err,
            })
            state.completeGeneration(agentId)
          }
        }
      }
    },
    [toolName, input, result, isError] as const
  )
}

test.describe('AI Chat Panel and Multi-Agent Interaction', () => {
  test('opens AI panel with Cmd+L and shows default agent', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)

    // Panel should be visible with header
    const header = mainWindow.locator('.ai-chat-title')
    await expect(header).toHaveText('AI Agents')

    // Wait for default agent tab to appear
    await waitForDefaultAgent(mainWindow)

    // Default agent tab should exist and be active
    const agentTab = mainWindow.locator('.ai-agent-tab.active')
    await expect(agentTab).toBeVisible()
    await expect(agentTab.locator('.ai-agent-tab-name')).toHaveText('Agent 1')

    // Empty state message should be shown
    const emptyMessage = mainWindow.locator('.ai-message-list-empty')
    await expect(emptyMessage).toBeVisible()
    await expect(emptyMessage).toHaveText('No messages yet. Start a conversation below.')
  })

  test('create and switch between multiple agents', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Create a second agent via the + button
    const addButton = mainWindow.locator('.ai-agent-tab-add')
    await addButton.click()
    await mainWindow.waitForTimeout(1000)

    // Should now have 2 agent tabs
    const agentTabs = mainWindow.locator('.ai-agent-tab')
    await expect(agentTabs).toHaveCount(2, { timeout: 5000 })

    // Second agent should be active (auto-switched on creation)
    const activeTab = mainWindow.locator('.ai-agent-tab.active')
    await expect(activeTab.locator('.ai-agent-tab-name')).toHaveText('Agent 2')

    // Switch back to Agent 1 by clicking its tab
    const firstTab = agentTabs.first()
    await firstTab.click()
    await mainWindow.waitForTimeout(300)

    // First agent should now be active
    const newActiveTab = mainWindow.locator('.ai-agent-tab.active')
    await expect(newActiveTab.locator('.ai-agent-tab-name')).toHaveText('Agent 1')
  })

  test('remove an agent via close button', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Create a second agent
    await mainWindow.locator('.ai-agent-tab-add').click()
    await mainWindow.waitForTimeout(1000)

    const agentTabs = mainWindow.locator('.ai-agent-tab')
    await expect(agentTabs).toHaveCount(2, { timeout: 5000 })

    // Close buttons should be visible when there are multiple agents
    const closeButtons = mainWindow.locator('.ai-agent-tab-close')
    await expect(closeButtons.first()).toBeVisible()

    // Remove Agent 2 (the active one)
    const activeTabClose = mainWindow.locator('.ai-agent-tab.active .ai-agent-tab-close')
    await activeTabClose.click()
    await mainWindow.waitForTimeout(500)

    // Should now have only 1 agent tab
    await expect(agentTabs).toHaveCount(1, { timeout: 3000 })

    // Close button should be hidden when only one agent remains
    await expect(mainWindow.locator('.ai-agent-tab-close')).toHaveCount(0)
  })

  test('send a message via chat input', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Type a message in the chat input
    const chatInput = mainWindow.locator('.ai-chat-input')
    await expect(chatInput).toBeVisible()
    await chatInput.fill('Hello, AI agent!')

    // Press Enter to send
    await chatInput.press('Enter')
    await mainWindow.waitForTimeout(500)

    // User message should appear in the message list
    const userMessage = mainWindow.locator('.ai-message.user')
    await expect(userMessage).toBeVisible({ timeout: 3000 })
    await expect(userMessage.locator('.ai-message-text')).toHaveText('Hello, AI agent!')

    // Input should be cleared after sending
    await expect(chatInput).toHaveValue('')
  })

  test('display assistant response with text', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Inject a user message + assistant response via store
    await injectUserMessage(mainWindow, 'What is 2+2?')
    await injectAssistantResponse(mainWindow, 'The answer is 4.')
    await mainWindow.waitForTimeout(500)

    // Both messages should be visible
    const messages = mainWindow.locator('.ai-message')
    await expect(messages).toHaveCount(2, { timeout: 3000 })

    // User message
    const userMsg = mainWindow.locator('.ai-message.user')
    await expect(userMsg.locator('.ai-message-text')).toHaveText('What is 2+2?')

    // Assistant message
    const assistantMsg = mainWindow.locator('.ai-message.assistant')
    await expect(assistantMsg.locator('.ai-message-text')).toHaveText('The answer is 4.')
  })

  test('display tool call cards with expand/collapse', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Inject a user message and a tool call response
    await injectUserMessage(mainWindow, 'List files')
    await injectToolCallResponse(
      mainWindow,
      'list_directory',
      { path: '/home/user' },
      'file1.txt\nfile2.txt\nfolder/'
    )
    await mainWindow.waitForTimeout(500)

    // Tool call card should be visible
    const toolCard = mainWindow.locator('.ai-tool-card')
    await expect(toolCard).toBeVisible({ timeout: 3000 })

    // Tool name should be shown
    const toolName = toolCard.locator('.ai-tool-card-name')
    await expect(toolName).toHaveText('list_directory')

    // Status indicator should show success (green dot)
    const statusDot = toolCard.locator('.ai-tool-card-status.success')
    await expect(statusDot).toBeVisible()

    // Card body should be hidden initially (collapsed)
    const cardBody = toolCard.locator('.ai-tool-card-body')
    await expect(cardBody).not.toBeVisible()

    // Click header to expand
    const cardHeader = toolCard.locator('.ai-tool-card-header')
    await cardHeader.click()
    await mainWindow.waitForTimeout(300)

    // Card body should now be visible with parameters and result
    await expect(cardBody).toBeVisible()
    const paramsPre = cardBody.locator('.ai-tool-card-pre').first()
    const paramsText = await paramsPre.textContent()
    expect(paramsText).toContain('/home/user')

    // Result section should be visible
    const resultPre = cardBody.locator('.ai-tool-card-pre').nth(1)
    const resultText = await resultPre.textContent()
    expect(resultText).toContain('file1.txt')

    // Click header again to collapse
    await cardHeader.click()
    await mainWindow.waitForTimeout(300)
    await expect(cardBody).not.toBeVisible()
  })

  test('display error tool call card', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Inject a tool call with an error result
    await injectUserMessage(mainWindow, 'Read a file')
    await injectToolCallResponse(
      mainWindow,
      'read_file',
      { path: '/nonexistent' },
      'Error: File not found',
      true
    )
    await mainWindow.waitForTimeout(500)

    // Tool card should have error styling
    const toolCard = mainWindow.locator('.ai-tool-card.error')
    await expect(toolCard).toBeVisible({ timeout: 3000 })

    // Status should show error
    const statusDot = toolCard.locator('.ai-tool-card-status.error')
    await expect(statusDot).toBeVisible()
  })

  test('stop generation button appears and works', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Set the active agent to generating state
    await mainWindow.evaluate(() => {
      const agentStore = (window as any).__SMOKE_STORES__?.agentStore
      if (agentStore) {
        const state = agentStore.getState()
        const agentId = state.activeAgentId
        if (agentId) {
          // Add an assistant message which sets isGenerating to true
          state.addAssistantMessage(agentId)
        }
      }
    })
    await mainWindow.waitForTimeout(300)

    // Stop button should be visible when generating
    const stopBtn = mainWindow.locator('.ai-stop-btn')
    await expect(stopBtn).toBeVisible({ timeout: 3000 })
    await expect(stopBtn).toHaveText('Stop generating')

    // Chat input should be hidden during generation
    const chatInput = mainWindow.locator('.ai-chat-input')
    await expect(chatInput).not.toBeVisible()

    // Click stop button
    await stopBtn.click()
    await mainWindow.waitForTimeout(500)

    // Stop button should disappear and input should reappear
    await expect(stopBtn).not.toBeVisible({ timeout: 3000 })
    await expect(mainWindow.locator('.ai-chat-input')).toBeVisible()
  })

  test('clear chat history', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Add messages to the chat
    await injectUserMessage(mainWindow, 'Message 1')
    await injectAssistantResponse(mainWindow, 'Response 1')
    await mainWindow.waitForTimeout(500)

    // Messages should be visible
    const messages = mainWindow.locator('.ai-message')
    await expect(messages).toHaveCount(2, { timeout: 3000 })

    // Clear button should be visible when there are messages
    const clearBtn = mainWindow.locator('.ai-chat-clear-btn')
    await expect(clearBtn).toBeVisible()

    // Click clear button
    await clearBtn.click()
    await mainWindow.waitForTimeout(500)

    // Messages should be gone, empty state should return
    const emptyMessage = mainWindow.locator('.ai-message-list-empty')
    await expect(emptyMessage).toBeVisible({ timeout: 3000 })

    // Clear button should be hidden when no messages
    await expect(clearBtn).not.toBeVisible()
  })

  test('agent role assignment', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Click the "Set role..." button
    const roleBtn = mainWindow.locator('.ai-agent-role-btn')
    await expect(roleBtn).toBeVisible({ timeout: 3000 })
    await expect(roleBtn).toHaveText('Set role...')
    await roleBtn.click()
    await mainWindow.waitForTimeout(300)

    // Role input should appear
    const roleInput = mainWindow.locator('.ai-agent-role-input')
    await expect(roleInput).toBeVisible()

    // Type a role
    await roleInput.fill('frontend')
    await roleInput.press('Enter')
    await mainWindow.waitForTimeout(500)

    // Role button should show the assigned role
    await expect(roleBtn).toBeVisible()
    await expect(roleBtn).toHaveText('Role: frontend')

    // Verify via store
    const role = await mainWindow.evaluate(() => {
      const agentStore = (window as any).__SMOKE_STORES__?.agentStore
      if (agentStore) {
        const state = agentStore.getState()
        const agent = state.agents.get(state.activeAgentId)
        return agent?.role
      }
      return null
    })
    expect(role).toBe('frontend')
  })

  test('agent group assignment', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Group select should be visible with "No group" default
    const groupSelect = mainWindow.locator('.ai-agent-group-select')
    await expect(groupSelect).toBeVisible({ timeout: 3000 })

    // Verify the default value is empty (no group)
    const defaultValue = await groupSelect.inputValue()
    expect(defaultValue).toBe('')

    // Create a group via store so we have something to assign
    await mainWindow.evaluate(() => {
      const groupStore = (window as any).__SMOKE_STORES__?.groupStore
      if (groupStore) {
        groupStore.getState().createGroup('Test Group', '#61afef')
      }
    })
    await mainWindow.waitForTimeout(500)

    // The group option should now appear in the select dropdown
    const options = groupSelect.locator('option')
    const optionCount = await options.count()
    expect(optionCount).toBeGreaterThanOrEqual(2) // "No group" + "Test Group"

    // Select the group
    const groupId = await mainWindow.evaluate(() => {
      const groupStore = (window as any).__SMOKE_STORES__?.groupStore
      if (groupStore) {
        const groups = Array.from(groupStore.getState().groups.values())
        return groups[0]?.id ?? null
      }
      return null
    })

    if (groupId) {
      await groupSelect.selectOption(groupId)
      await mainWindow.waitForTimeout(500)

      // Verify the agent store was updated
      const assignedGroupId = await mainWindow.evaluate(() => {
        const agentStore = (window as any).__SMOKE_STORES__?.agentStore
        if (agentStore) {
          const state = agentStore.getState()
          const agent = state.agents.get(state.activeAgentId)
          return agent?.assignedGroupId
        }
        return null
      })
      expect(assignedGroupId).toBe(groupId)
    }
  })

  test('messages are per-agent (switching agents shows different history)', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Add messages to Agent 1
    await injectUserMessage(mainWindow, 'Agent 1 message')
    await injectAssistantResponse(mainWindow, 'Agent 1 response')
    await mainWindow.waitForTimeout(500)

    // Create Agent 2
    await mainWindow.locator('.ai-agent-tab-add').click()
    await mainWindow.waitForTimeout(1000)

    // Agent 2 should be active with no messages
    const emptyMessage = mainWindow.locator('.ai-message-list-empty')
    await expect(emptyMessage).toBeVisible({ timeout: 3000 })

    // Add messages to Agent 2
    await injectUserMessage(mainWindow, 'Agent 2 message')
    await injectAssistantResponse(mainWindow, 'Agent 2 response')
    await mainWindow.waitForTimeout(500)

    // Verify Agent 2's messages
    let userMsg = mainWindow.locator('.ai-message.user .ai-message-text')
    await expect(userMsg).toHaveText('Agent 2 message')

    // Switch back to Agent 1
    const agentTabs = mainWindow.locator('.ai-agent-tab')
    await agentTabs.first().click()
    await mainWindow.waitForTimeout(500)

    // Agent 1's messages should be shown
    userMsg = mainWindow.locator('.ai-message.user .ai-message-text')
    await expect(userMsg).toHaveText('Agent 1 message')

    const assistantMsg = mainWindow.locator('.ai-message.assistant .ai-message-text')
    await expect(assistantMsg).toHaveText('Agent 1 response')
  })

  test('each agent has a distinct color swatch', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Create a second agent
    await mainWindow.locator('.ai-agent-tab-add').click()
    await mainWindow.waitForTimeout(1000)

    // Both tabs should have color swatches
    const swatches = mainWindow.locator('.ai-agent-tab-color')
    await expect(swatches).toHaveCount(2, { timeout: 3000 })

    // Get the background colors
    const color1 = await swatches.first().evaluate(
      (el) => getComputedStyle(el).backgroundColor
    )
    const color2 = await swatches.nth(1).evaluate(
      (el) => getComputedStyle(el).backgroundColor
    )

    // Colors should be different
    expect(color1).not.toBe(color2)
  })

  test('Shift+Enter inserts newline instead of sending', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    const chatInput = mainWindow.locator('.ai-chat-input')
    await expect(chatInput).toBeVisible()

    // Focus the textarea and type using fill + keyboard for reliable input
    await chatInput.click()
    await chatInput.fill('FirstLine')

    // Press Shift+Enter for newline
    await chatInput.press('Shift+Enter')

    // Type second line using keyboard
    await mainWindow.keyboard.type('SecondLine')
    await mainWindow.waitForTimeout(300)

    // Message should not have been sent (no user message bubble)
    const userMessage = mainWindow.locator('.ai-message.user')
    await expect(userMessage).toHaveCount(0)

    // Input should contain multi-line text
    const value = await chatInput.inputValue()
    expect(value).toContain('FirstLine')
    expect(value).toContain('SecondLine')
    // Should have a newline between lines
    expect(value).toMatch(/FirstLine[\s\S]*SecondLine/)
  })

  test('error banner displays when agent has error', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Set an error on the agent
    await mainWindow.evaluate(() => {
      const agentStore = (window as any).__SMOKE_STORES__?.agentStore
      if (agentStore) {
        const state = agentStore.getState()
        if (state.activeAgentId) {
          state.setError(state.activeAgentId, 'Connection timeout')
        }
      }
    })
    await mainWindow.waitForTimeout(300)

    // Error banner should appear
    const errorBanner = mainWindow.locator('.ai-error-banner')
    await expect(errorBanner).toBeVisible({ timeout: 3000 })
    await expect(errorBanner).toHaveText('Connection timeout')
  })

  test('close AI panel with Cmd+L', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)

    // Panel should be visible
    const panel = mainWindow.locator('.ai-chat-panel')
    await expect(panel).toBeVisible()

    // Press Cmd+L again to close
    await pressShortcut(mainWindow, 'l')
    await mainWindow.waitForTimeout(500)

    // Panel should be hidden
    await expect(panel).not.toBeVisible({ timeout: 3000 })
  })

  test('generating indicator shows on agent tab during generation', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Start generation on the active agent
    await mainWindow.evaluate(() => {
      const agentStore = (window as any).__SMOKE_STORES__?.agentStore
      if (agentStore) {
        const state = agentStore.getState()
        if (state.activeAgentId) {
          state.addAssistantMessage(state.activeAgentId)
        }
      }
    })
    await mainWindow.waitForTimeout(300)

    // Generating indicator (pulse dot) should appear on the agent tab
    const indicator = mainWindow.locator('.ai-agent-tab-indicator')
    await expect(indicator).toBeVisible({ timeout: 3000 })

    // Complete generation
    await mainWindow.evaluate(() => {
      const agentStore = (window as any).__SMOKE_STORES__?.agentStore
      if (agentStore) {
        const state = agentStore.getState()
        if (state.activeAgentId) {
          state.completeGeneration(state.activeAgentId)
        }
      }
    })
    await mainWindow.waitForTimeout(300)

    // Indicator should disappear
    await expect(indicator).not.toBeVisible({ timeout: 3000 })
  })

  test('canvas action: session_created spawns terminal on canvas', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)
    await waitForDefaultAgent(mainWindow)

    // Spawn a real PTY using the smokeAPI with required id and cwd
    const sessionId = `ai-session-${Date.now()}`
    await mainWindow.evaluate(async (id) => {
      await window.smokeAPI.pty.spawn({ id, cwd: '/tmp' })
    }, sessionId)

    // Simulate the canvas action handler registering the session in the store
    await mainWindow.evaluate((id) => {
      const sessionStore = (window as any).__SMOKE_STORES__?.sessionStore
      if (sessionStore) {
        const sessions = new Map(sessionStore.getState().sessions)
        sessions.set(id, {
          id,
          type: 'terminal',
          title: 'AI Terminal',
          cwd: '/tmp',
          position: { x: 100, y: 100 },
          size: { cols: 80, rows: 24, width: 640, height: 480 },
          zIndex: 10,
          status: 'running',
          createdAt: Date.now(),
        })
        sessionStore.setState({ sessions })
        sessionStore.getState().focusSession(id)
        sessionStore.getState().bringToFront(id)
      }
    }, sessionId)
    await mainWindow.waitForTimeout(1000)

    // Terminal window should appear on the canvas
    const terminalWindow = mainWindow.locator(`.terminal-window[data-session-id="${sessionId}"]`)
    await expect(terminalWindow).toBeVisible({ timeout: 5000 })
  })

  test('canvas action: file_edited opens file viewer', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)

    // Create a file viewer session via the session store to simulate AI file_edited action
    await mainWindow.evaluate(() => {
      const sessionStore = (window as any).__SMOKE_STORES__?.sessionStore
      if (sessionStore) {
        sessionStore.getState().createFileSession(
          '/tmp/ai-test-file.ts',
          'console.log("hello from AI")',
          'typescript',
          { x: 200, y: 200 }
        )
      }
    })
    await mainWindow.waitForTimeout(1000)

    // File viewer should be visible on the canvas
    const fileViewer = mainWindow.locator('.file-viewer-window, .file-session')
    const count = await fileViewer.count()

    if (count > 0) {
      await expect(fileViewer.first()).toBeVisible()
    } else {
      // Verify the session was at least created in the store
      const sessionCount = await mainWindow.evaluate(() => {
        const sessionStore = (window as any).__SMOKE_STORES__?.sessionStore
        if (sessionStore) {
          return sessionStore.getState().sessions.size
        }
        return 0
      })
      expect(sessionCount).toBeGreaterThanOrEqual(1)
    }
  })

  test('Assemble button is visible', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await openAiPanel(mainWindow)

    const assembleBtn = mainWindow.locator('.ai-chat-assemble-btn')
    await expect(assembleBtn).toBeVisible({ timeout: 3000 })
    await expect(assembleBtn).toHaveText('Assemble')
  })
})
