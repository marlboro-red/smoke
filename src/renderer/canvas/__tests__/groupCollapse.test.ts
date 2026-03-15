import { describe, it, expect, beforeEach } from 'vitest'
import { groupStore, findGroupByElementId } from '../../stores/groupStore'
import { sessionStore } from '../../stores/sessionStore'

describe('group collapse/expand', () => {
  beforeEach(() => {
    groupStore.setState({ groups: new Map() })
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  it('collapsed group hides members from visible set', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    const s3 = sessionStore.getState().createSession('/c')

    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, s1.id)
    groupStore.getState().addMember(group.id, s2.id)

    // Collapse the group
    groupStore.getState().toggleCollapsed(group.id)
    const collapsed = groupStore.getState().groups.get(group.id)!
    expect(collapsed.collapsed).toBe(true)

    // Build the hidden set (same logic as Canvas)
    const hiddenIds = new Set<string>()
    for (const g of groupStore.getState().groups.values()) {
      if (g.collapsed) {
        for (const memberId of g.memberIds) {
          hiddenIds.add(memberId)
        }
      }
    }

    expect(hiddenIds.has(s1.id)).toBe(true)
    expect(hiddenIds.has(s2.id)).toBe(true)
    expect(hiddenIds.has(s3.id)).toBe(false)
  })

  it('expanded group shows all members', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')

    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, s1.id)
    groupStore.getState().addMember(group.id, s2.id)

    // Collapse then expand
    groupStore.getState().toggleCollapsed(group.id)
    groupStore.getState().toggleCollapsed(group.id)

    const expanded = groupStore.getState().groups.get(group.id)!
    expect(expanded.collapsed).toBe(false)

    const hiddenIds = new Set<string>()
    for (const g of groupStore.getState().groups.values()) {
      if (g.collapsed) {
        for (const memberId of g.memberIds) {
          hiddenIds.add(memberId)
        }
      }
    }

    expect(hiddenIds.has(s1.id)).toBe(false)
    expect(hiddenIds.has(s2.id)).toBe(false)
  })

  it('toggleCollapsed recomputes bounding box before collapsing', () => {
    const s1 = sessionStore.getState().createSession('/a')
    sessionStore.getState().updateSession(s1.id, {
      position: { x: 100, y: 200 },
      size: { cols: 80, rows: 24, width: 300, height: 250 },
    })

    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, s1.id)

    // Move the session to a new position
    sessionStore.getState().updateSession(s1.id, {
      position: { x: 500, y: 600 },
    })

    // Toggle collapse — should recompute bounding box first
    groupStore.getState().toggleCollapsed(group.id)
    const collapsed = groupStore.getState().groups.get(group.id)!
    expect(collapsed.boundingBox.x).toBe(500)
    expect(collapsed.boundingBox.y).toBe(600)
  })

  it('collapsed card data includes group name and member count', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    const s3 = sessionStore.getState().createSession('/c')

    const group = groupStore.getState().createGroup('My Servers', '#D94A4A')
    groupStore.getState().addMember(group.id, s1.id)
    groupStore.getState().addMember(group.id, s2.id)
    groupStore.getState().addMember(group.id, s3.id)

    groupStore.getState().toggleCollapsed(group.id)
    const collapsed = groupStore.getState().groups.get(group.id)!

    expect(collapsed.name).toBe('My Servers')
    expect(collapsed.color).toBe('#D94A4A')
    expect(collapsed.memberIds.length).toBe(3)
    expect(collapsed.collapsed).toBe(true)
  })

  it('findGroupByElementId locates the group containing a session', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, s1.id)

    const found = findGroupByElementId(s1.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(group.id)
  })

  it('findGroupByElementId returns undefined for ungrouped sessions', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const found = findGroupByElementId(s1.id)
    expect(found).toBeUndefined()
  })

  it('multiple groups can be independently collapsed', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    const s3 = sessionStore.getState().createSession('/c')

    const g1 = groupStore.getState().createGroup('G1')
    const g2 = groupStore.getState().createGroup('G2')
    groupStore.getState().addMember(g1.id, s1.id)
    groupStore.getState().addMember(g2.id, s2.id)

    // Collapse only g1
    groupStore.getState().toggleCollapsed(g1.id)

    const hiddenIds = new Set<string>()
    for (const g of groupStore.getState().groups.values()) {
      if (g.collapsed) {
        for (const memberId of g.memberIds) {
          hiddenIds.add(memberId)
        }
      }
    }

    expect(hiddenIds.has(s1.id)).toBe(true)
    expect(hiddenIds.has(s2.id)).toBe(false)
    expect(hiddenIds.has(s3.id)).toBe(false)
  })
})
