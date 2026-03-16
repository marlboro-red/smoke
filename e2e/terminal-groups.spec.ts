import { test, expect } from './fixtures'
import { waitForAppReady, pressShortcut } from './helpers'
import type { Page } from '@playwright/test'

/**
 * Helper: clean up all groups and extra sessions via the store.
 * Leaves one terminal alive so the Electron app doesn't close.
 */
async function cleanState(page: Page): Promise<void> {
  await page.evaluate(() => {
    const gStore = (window as any).__SMOKE_STORES__.groupStore.getState()
    // Remove all groups
    for (const [id] of gStore.groups) {
      gStore.removeGroup(id)
    }
    // Clear broadcast
    const sStore = (window as any).__SMOKE_STORES__.sessionStore.getState()
    if (sStore.broadcastGroupId) {
      sStore.toggleBroadcast(sStore.broadcastGroupId)
    }
  })
}

/**
 * Helper: create a terminal session and return its ID.
 */
async function createSession(page: Page): Promise<string> {
  await pressShortcut(page, 'n')
  await page.waitForTimeout(500)

  const terminalWindow = page.locator('.terminal-window').last()
  await expect(terminalWindow).toBeVisible({ timeout: 5000 })
  const sessionId = await terminalWindow.getAttribute('data-session-id')
  expect(sessionId).toBeTruthy()
  return sessionId!
}

/**
 * Helper: create a group via the store and return its ID.
 */
async function createGroup(page: Page, name: string, color?: string): Promise<string> {
  return page.evaluate(
    ([n, c]) => {
      const store = (window as any).__SMOKE_STORES__.groupStore.getState()
      const group = store.createGroup(n, c || undefined)
      return group.id
    },
    [name, color ?? null] as const
  )
}

/**
 * Helper: add a session to a group via the store.
 */
async function addMemberToGroup(page: Page, groupId: string, sessionId: string): Promise<void> {
  await page.evaluate(
    ([gId, sId]) => {
      (window as any).__SMOKE_STORES__.groupStore.getState().addMember(gId, sId)
    },
    [groupId, sessionId] as const
  )
}

/**
 * Helper: get group state from the store.
 */
async function getGroup(
  page: Page,
  groupId: string
): Promise<{
  id: string
  name: string
  color: string
  memberIds: string[]
  collapsed: boolean
  boundingBox: { x: number; y: number; width: number; height: number }
} | null> {
  return page.evaluate((gId) => {
    const store = (window as any).__SMOKE_STORES__.groupStore.getState()
    const group = store.groups.get(gId)
    if (!group) return null
    return {
      id: group.id,
      name: group.name,
      color: group.color,
      memberIds: [...group.memberIds],
      collapsed: group.collapsed,
      boundingBox: { ...group.boundingBox },
    }
  }, groupId)
}

test.describe('Group Lifecycle', () => {
  test('create a group via store and verify state', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const groupId = await createGroup(mainWindow, 'Test Group', '#4A90D9')

    const group = await getGroup(mainWindow, groupId)
    expect(group).not.toBeNull()
    expect(group!.name).toBe('Test Group')
    expect(group!.color).toBe('#4A90D9')
    expect(group!.memberIds).toHaveLength(0)
    expect(group!.collapsed).toBe(false)
  })

  test('add members to a group', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const session2 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Multi Group')

    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session2)
    await mainWindow.waitForTimeout(300)

    const group = await getGroup(mainWindow, groupId)
    expect(group!.memberIds).toHaveLength(2)
    expect(group!.memberIds).toContain(session1)
    expect(group!.memberIds).toContain(session2)

    // Verify groupId is set on sessions
    const s1GroupId = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.get(id)?.groupId
    }, session1)
    expect(s1GroupId).toBe(groupId)
  })

  test('remove a member from a group', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const session2 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Remove Test')

    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session2)
    await mainWindow.waitForTimeout(200)

    // Remove session1
    await mainWindow.evaluate(
      ([gId, sId]) => {
        (window as any).__SMOKE_STORES__.groupStore.getState().removeMember(gId, sId)
      },
      [groupId, session1] as const
    )
    await mainWindow.waitForTimeout(200)

    const group = await getGroup(mainWindow, groupId)
    expect(group!.memberIds).toHaveLength(1)
    expect(group!.memberIds).toContain(session2)
    expect(group!.memberIds).not.toContain(session1)

    // Verify groupId cleared on removed session
    const s1GroupId = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.get(id)?.groupId
    }, session1)
    expect(s1GroupId).toBeUndefined()
  })

  test('rename a group via updateGroup', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const groupId = await createGroup(mainWindow, 'Original Name')

    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.groupStore.getState().updateGroup(gId, { name: 'Renamed Group' })
    }, groupId)

    const group = await getGroup(mainWindow, groupId)
    expect(group!.name).toBe('Renamed Group')
  })

  test('delete a group and clear member groupIds', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Delete Me')
    await addMemberToGroup(mainWindow, groupId, session1)
    await mainWindow.waitForTimeout(200)

    // Delete group
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.groupStore.getState().removeGroup(gId)
    }, groupId)
    await mainWindow.waitForTimeout(200)

    // Group should be gone
    const group = await getGroup(mainWindow, groupId)
    expect(group).toBeNull()

    // Session groupId should be cleared
    const s1GroupId = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.get(id)?.groupId
    }, session1)
    expect(s1GroupId).toBeUndefined()
  })

  test('deleting a session removes it from its group automatically', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const session2 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Auto Cleanup')
    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session2)
    await mainWindow.waitForTimeout(200)

    // Delete session1 via store
    await mainWindow.evaluate((id) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().removeSession(id)
    }, session1)
    await mainWindow.waitForTimeout(500)

    // Group should have only session2
    const group = await getGroup(mainWindow, groupId)
    expect(group!.memberIds).not.toContain(session1)
    expect(group!.memberIds).toContain(session2)
  })

  test('duplicate add is idempotent', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Dup Test')
    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session1) // add again
    await mainWindow.waitForTimeout(200)

    const group = await getGroup(mainWindow, groupId)
    expect(group!.memberIds).toHaveLength(1)
  })
})

test.describe('Command Broadcasting', () => {
  test('toggle broadcast mode via store', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Broadcast Group')
    await addMemberToGroup(mainWindow, groupId, session1)
    await mainWindow.waitForTimeout(200)

    // Enable broadcast
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().toggleBroadcast(gId)
    }, groupId)

    const broadcastId = await mainWindow.evaluate(() => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().broadcastGroupId
    })
    expect(broadcastId).toBe(groupId)

    // Toggle off
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().toggleBroadcast(gId)
    }, groupId)

    const broadcastIdAfter = await mainWindow.evaluate(() => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().broadcastGroupId
    })
    expect(broadcastIdAfter).toBeNull()
  })

  test('broadcast sends data to all group members via PTY write', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const session2 = await createSession(mainWindow)
    await mainWindow.waitForTimeout(1000) // wait for shell init

    const groupId = await createGroup(mainWindow, 'Broadcast Test')
    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session2)
    await mainWindow.waitForTimeout(200)

    // Enable broadcast
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().toggleBroadcast(gId)
    }, groupId)

    // Write to all group member PTYs (simulates broadcastToGroup)
    const marker = `BCAST_${Date.now()}`
    await mainWindow.evaluate(
      ([gId, cmd]) => {
        const state = (window as any).__SMOKE_STORES__.sessionStore.getState()
        const sessions = state.sessions
        for (const [id, session] of sessions) {
          if ((session as any).groupId === gId && (session as any).type === 'terminal') {
            window.smokeAPI.pty.write(id, `echo ${cmd}\n`)
          }
        }
      },
      [groupId, marker] as const
    )

    await mainWindow.waitForTimeout(2000)

    // Both terminals should still be running (PTY write didn't crash them)
    const s1Status = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.get(id)?.status
    }, session1)
    const s2Status = await mainWindow.evaluate((id) => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().sessions.get(id)?.status
    }, session2)
    expect(s1Status).toBe('running')
    expect(s2Status).toBe('running')
  })

  test('Cmd+Shift+B toggles broadcast for focused session group', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Shortcut Broadcast')
    await addMemberToGroup(mainWindow, groupId, session1)
    await mainWindow.waitForTimeout(200)

    // Focus the session
    await mainWindow.evaluate((id) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusSession(id)
    }, session1)
    await mainWindow.waitForTimeout(200)

    // Press Cmd+Shift+B to toggle broadcast
    await pressShortcut(mainWindow, 'b', { shift: true })
    await mainWindow.waitForTimeout(300)

    const broadcastId = await mainWindow.evaluate(() => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().broadcastGroupId
    })
    expect(broadcastId).toBe(groupId)

    // Press again to toggle off
    await pressShortcut(mainWindow, 'b', { shift: true })
    await mainWindow.waitForTimeout(300)

    const broadcastIdAfter = await mainWindow.evaluate(() => {
      return (window as any).__SMOKE_STORES__.sessionStore.getState().broadcastGroupId
    })
    expect(broadcastIdAfter).toBeNull()
  })

  test('broadcast input appears in sidebar when broadcast is active', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const session2 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Sidebar Broadcast')
    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session2)
    await mainWindow.waitForTimeout(200)

    // Ensure sidebar is visible
    const sidebar = mainWindow.locator('.sidebar')
    if (!(await sidebar.isVisible())) {
      await pressShortcut(mainWindow, '\\')
      await mainWindow.waitForTimeout(300)
    }

    // No broadcast input initially
    const inputBefore = mainWindow.locator('.broadcast-input')
    await expect(inputBefore).toHaveCount(0)

    // Enable broadcast
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().toggleBroadcast(gId)
    }, groupId)
    await mainWindow.waitForTimeout(300)

    // Broadcast input should now be visible
    const inputAfter = mainWindow.locator('.broadcast-input')
    await expect(inputAfter).toBeVisible({ timeout: 3000 })

    // Broadcast toggle button should have 'active' class
    const toggleActive = mainWindow.locator('.broadcast-toggle.active')
    await expect(toggleActive).toBeVisible({ timeout: 3000 })
  })
})

test.describe('Collapse and Expand', () => {
  test('toggle collapse hides group members and shows collapsed card', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const session2 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Collapse Test')
    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session2)
    await mainWindow.waitForTimeout(500)

    // Verify members are visible
    await expect(mainWindow.locator(`[data-session-id="${session1}"]`)).toBeVisible({ timeout: 3000 })
    await expect(mainWindow.locator(`[data-session-id="${session2}"]`)).toBeVisible({ timeout: 3000 })

    // Collapse the group
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.groupStore.getState().toggleCollapsed(gId)
    }, groupId)
    await mainWindow.waitForTimeout(500)

    // Verify group is collapsed in store
    const group = await getGroup(mainWindow, groupId)
    expect(group!.collapsed).toBe(true)

    // Members should be hidden (not rendered in DOM)
    expect(await mainWindow.locator(`[data-session-id="${session1}"]`).count()).toBe(0)
    expect(await mainWindow.locator(`[data-session-id="${session2}"]`).count()).toBe(0)

    // Collapsed card should be visible
    await expect(mainWindow.locator('.group-collapsed-card')).toBeVisible({ timeout: 3000 })
  })

  test('collapsed card shows group name and member count', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const session2 = await createSession(mainWindow)
    const session3 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Count Check')
    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session2)
    await addMemberToGroup(mainWindow, groupId, session3)
    await mainWindow.waitForTimeout(300)

    // Collapse
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.groupStore.getState().toggleCollapsed(gId)
    }, groupId)
    await mainWindow.waitForTimeout(500)

    await expect(mainWindow.locator('.group-collapsed-card')).toBeVisible({ timeout: 3000 })

    // Card should show group name
    await expect(mainWindow.locator('.group-collapsed-name')).toHaveText('Count Check')

    // Card should show member count
    await expect(mainWindow.locator('.group-collapsed-count')).toHaveText('3 items')
  })

  test('clicking collapsed card expands the group', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Click Expand')
    await addMemberToGroup(mainWindow, groupId, session1)
    await mainWindow.waitForTimeout(300)

    // Collapse
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.groupStore.getState().toggleCollapsed(gId)
    }, groupId)
    await mainWindow.waitForTimeout(500)

    // Click the collapsed card to expand
    const collapsedCard = mainWindow.locator('.group-collapsed-card')
    await expect(collapsedCard).toBeVisible({ timeout: 3000 })
    await collapsedCard.click()
    await mainWindow.waitForTimeout(500)

    // Group should be expanded
    const group = await getGroup(mainWindow, groupId)
    expect(group!.collapsed).toBe(false)

    // Session should be visible again
    await expect(mainWindow.locator(`[data-session-id="${session1}"]`)).toBeVisible({ timeout: 3000 })

    // Collapsed card should be gone
    expect(await mainWindow.locator('.group-collapsed-card').count()).toBe(0)
  })

  test('Cmd+Shift+G toggles collapse for focused session group', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Shortcut Collapse')
    await addMemberToGroup(mainWindow, groupId, session1)
    await mainWindow.waitForTimeout(300)

    // Focus the session
    await mainWindow.evaluate((id) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().focusSession(id)
    }, session1)
    await mainWindow.waitForTimeout(200)

    // Press Cmd+Shift+G to collapse
    await pressShortcut(mainWindow, 'g', { shift: true })
    await mainWindow.waitForTimeout(500)

    const group = await getGroup(mainWindow, groupId)
    expect(group!.collapsed).toBe(true)

    // Member should be hidden
    expect(await mainWindow.locator(`[data-session-id="${session1}"]`).count()).toBe(0)
  })

  test('collapsed card shows singular count for 1 item', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Singular')
    await addMemberToGroup(mainWindow, groupId, session1)
    await mainWindow.waitForTimeout(300)

    // Collapse
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.groupStore.getState().toggleCollapsed(gId)
    }, groupId)
    await mainWindow.waitForTimeout(500)

    await expect(mainWindow.locator('.group-collapsed-count')).toHaveText('1 item')
  })
})

test.describe('Group Visual Container', () => {
  test('expanded group renders container with dashed border', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Visual Group', '#4A90D9')
    await addMemberToGroup(mainWindow, groupId, session1)
    await mainWindow.waitForTimeout(500)

    // Group container should be visible
    const container = mainWindow.locator('.group-container')
    await expect(container).toBeVisible({ timeout: 3000 })

    // Verify dashed border style
    const borderStyle = await container.evaluate((el) => {
      const computed = window.getComputedStyle(el)
      return computed.borderStyle
    })
    expect(borderStyle).toBe('dashed')
  })

  test('group container shows label with name and item count', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const session2 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Label Group')
    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session2)
    await mainWindow.waitForTimeout(500)

    // Group label should show the group name
    const groupLabel = mainWindow.locator('.group-container .group-label')
    await expect(groupLabel).toBeVisible({ timeout: 3000 })

    const labelText = await groupLabel.textContent()
    expect(labelText).toContain('Label Group')
    expect(labelText).toContain('2 items')
  })

  test('bounding box updates when member is added', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Bbox Test')
    await addMemberToGroup(mainWindow, groupId, session1)
    await mainWindow.waitForTimeout(300)

    const bboxBefore = (await getGroup(mainWindow, groupId))!.boundingBox

    // Create a second session at a different position
    const session2 = await createSession(mainWindow)
    await mainWindow.evaluate((id) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().updateSession(id, {
        position: { x: 500, y: 500 },
      })
    }, session2)
    await mainWindow.waitForTimeout(200)

    // Add to group
    await addMemberToGroup(mainWindow, groupId, session2)
    await mainWindow.waitForTimeout(300)

    const bboxAfter = (await getGroup(mainWindow, groupId))!.boundingBox

    // Bounding box should have grown to encompass both sessions
    expect(bboxAfter.width).toBeGreaterThan(bboxBefore.width)
    expect(bboxAfter.height).toBeGreaterThan(bboxBefore.height)
  })

  test('bounding box shrinks when member is removed', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const session2 = await createSession(mainWindow)

    // Position session2 far away
    await mainWindow.evaluate((id) => {
      (window as any).__SMOKE_STORES__.sessionStore.getState().updateSession(id, {
        position: { x: 800, y: 800 },
      })
    }, session2)
    await mainWindow.waitForTimeout(200)

    const groupId = await createGroup(mainWindow, 'Shrink Test')
    await addMemberToGroup(mainWindow, groupId, session1)
    await addMemberToGroup(mainWindow, groupId, session2)
    await mainWindow.waitForTimeout(300)

    const bboxBefore = (await getGroup(mainWindow, groupId))!.boundingBox

    // Remove the far-away session
    await mainWindow.evaluate(
      ([gId, sId]) => {
        (window as any).__SMOKE_STORES__.groupStore.getState().removeMember(gId, sId)
      },
      [groupId, session2] as const
    )
    await mainWindow.waitForTimeout(300)

    const bboxAfter = (await getGroup(mainWindow, groupId))!.boundingBox

    // Bounding box should have shrunk
    expect(bboxAfter.width).toBeLessThan(bboxBefore.width)
    expect(bboxAfter.height).toBeLessThan(bboxBefore.height)
  })

  test('group container is not rendered when group has no members', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    await createGroup(mainWindow, 'Empty Group')
    await mainWindow.waitForTimeout(300)

    // No group container should be rendered for an empty group
    expect(await mainWindow.locator('.group-container').count()).toBe(0)
  })

  test('collapsed group hides container and shows card instead', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const session1 = await createSession(mainWindow)
    const groupId = await createGroup(mainWindow, 'Toggle Visual')
    await addMemberToGroup(mainWindow, groupId, session1)
    await mainWindow.waitForTimeout(500)

    // Container visible when expanded
    await expect(mainWindow.locator('.group-container')).toBeVisible({ timeout: 3000 })
    expect(await mainWindow.locator('.group-collapsed-card').count()).toBe(0)

    // Collapse
    await mainWindow.evaluate((gId) => {
      (window as any).__SMOKE_STORES__.groupStore.getState().toggleCollapsed(gId)
    }, groupId)
    await mainWindow.waitForTimeout(500)

    // Card should appear
    await expect(mainWindow.locator('.group-collapsed-card')).toBeVisible({ timeout: 3000 })
  })

  test('group assigns default colors cyclically', async ({ mainWindow }) => {
    await waitForAppReady(mainWindow)
    await cleanState(mainWindow)

    const expectedColors = ['#4A90D9', '#D94A4A', '#4AD97A', '#D9C74A', '#9B59B6', '#E67E22']

    const groupIds: string[] = []
    for (let i = 0; i < 7; i++) {
      groupIds.push(await createGroup(mainWindow, `Color Group ${i}`))
    }

    for (let i = 0; i < 7; i++) {
      const group = await getGroup(mainWindow, groupIds[i])
      expect(group!.color).toBe(expectedColors[i % 6])
    }
  })
})
