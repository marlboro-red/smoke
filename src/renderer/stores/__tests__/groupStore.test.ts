import { describe, it, expect, beforeEach } from 'vitest'
import { groupStore } from '../groupStore'
import { sessionStore } from '../sessionStore'

describe('groupStore', () => {
  beforeEach(() => {
    groupStore.setState({ groups: new Map() })
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  it('creates a group with UUID, name, color, and empty members', () => {
    const group = groupStore.getState().createGroup('My Group', '#ff0000')
    expect(group.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(group.name).toBe('My Group')
    expect(group.color).toBe('#ff0000')
    expect(group.memberIds).toEqual([])
    expect(group.collapsed).toBe(false)
    expect(group.boundingBox).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('assigns a default color when none is provided', () => {
    const group = groupStore.getState().createGroup('Test')
    expect(group.color).toBe('#4A90D9')
  })

  it('stores groups in Map for efficient lookup', () => {
    const g1 = groupStore.getState().createGroup('A')
    const g2 = groupStore.getState().createGroup('B')
    const { groups } = groupStore.getState()
    expect(groups).toBeInstanceOf(Map)
    expect(groups.get(g1.id)).toEqual(g1)
    expect(groups.get(g2.id)).toEqual(g2)
    expect(groups.size).toBe(2)
  })

  it('removes a group and clears groupId on member sessions', () => {
    const session = sessionStore.getState().createSession('/tmp')
    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, session.id)
    expect(sessionStore.getState().sessions.get(session.id)!.groupId).toBe(group.id)

    groupStore.getState().removeGroup(group.id)
    expect(groupStore.getState().groups.size).toBe(0)
    expect(sessionStore.getState().sessions.get(session.id)!.groupId).toBeUndefined()
  })

  it('updates a group with partial patch', () => {
    const group = groupStore.getState().createGroup('Old Name')
    groupStore.getState().updateGroup(group.id, { name: 'New Name', color: '#00ff00' })
    const updated = groupStore.getState().groups.get(group.id)!
    expect(updated.name).toBe('New Name')
    expect(updated.color).toBe('#00ff00')
  })

  it('adds a member and sets groupId on the session', () => {
    const session = sessionStore.getState().createSession('/tmp')
    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, session.id)

    const updated = groupStore.getState().groups.get(group.id)!
    expect(updated.memberIds).toContain(session.id)
    expect(sessionStore.getState().sessions.get(session.id)!.groupId).toBe(group.id)
  })

  it('does not duplicate member IDs when adding the same element twice', () => {
    const session = sessionStore.getState().createSession('/tmp')
    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, session.id)
    groupStore.getState().addMember(group.id, session.id)

    const updated = groupStore.getState().groups.get(group.id)!
    expect(updated.memberIds).toEqual([session.id])
  })

  it('removes a member and clears groupId on the session', () => {
    const session = sessionStore.getState().createSession('/tmp')
    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, session.id)
    groupStore.getState().removeMember(group.id, session.id)

    const updated = groupStore.getState().groups.get(group.id)!
    expect(updated.memberIds).not.toContain(session.id)
    expect(sessionStore.getState().sessions.get(session.id)!.groupId).toBeUndefined()
  })

  it('toggles collapsed state', () => {
    const group = groupStore.getState().createGroup('G')
    expect(groupStore.getState().groups.get(group.id)!.collapsed).toBe(false)
    groupStore.getState().toggleCollapsed(group.id)
    expect(groupStore.getState().groups.get(group.id)!.collapsed).toBe(true)
    groupStore.getState().toggleCollapsed(group.id)
    expect(groupStore.getState().groups.get(group.id)!.collapsed).toBe(false)
  })

  it('recomputes bounding box from member positions and sizes', () => {
    const s1 = sessionStore.getState().createSession('/a')
    const s2 = sessionStore.getState().createSession('/b')
    sessionStore.getState().updateSession(s1.id, {
      position: { x: 100, y: 100 },
      size: { cols: 80, rows: 24, width: 200, height: 150 },
    })
    sessionStore.getState().updateSession(s2.id, {
      position: { x: 400, y: 300 },
      size: { cols: 80, rows: 24, width: 200, height: 150 },
    })

    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, s1.id)
    groupStore.getState().addMember(group.id, s2.id)

    const updated = groupStore.getState().groups.get(group.id)!
    expect(updated.boundingBox).toEqual({
      x: 100,
      y: 100,
      width: 500,   // 400 + 200 - 100
      height: 350,  // 300 + 150 - 100
    })
  })

  it('resets bounding box when all members are removed', () => {
    const session = sessionStore.getState().createSession('/tmp')
    sessionStore.getState().updateSession(session.id, {
      position: { x: 50, y: 50 },
    })
    const group = groupStore.getState().createGroup('G')
    groupStore.getState().addMember(group.id, session.id)
    groupStore.getState().removeMember(group.id, session.id)

    const updated = groupStore.getState().groups.get(group.id)!
    expect(updated.boundingBox).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})
