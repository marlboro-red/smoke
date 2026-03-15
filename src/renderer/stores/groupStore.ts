import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { v4 as uuidv4 } from 'uuid'
import { sessionStore } from './sessionStore'

export interface Group {
  id: string
  name: string
  color: string
  memberIds: string[]
  collapsed: boolean
  boundingBox: { x: number; y: number; width: number; height: number }
}

interface GroupStore {
  groups: Map<string, Group>

  createGroup: (name: string, color?: string) => Group
  removeGroup: (id: string) => void
  updateGroup: (id: string, patch: Partial<Omit<Group, 'id'>>) => void
  addMember: (groupId: string, elementId: string) => void
  removeMember: (groupId: string, elementId: string) => void
  toggleCollapsed: (id: string) => void
  recomputeBoundingBox: (id: string) => void
}

const DEFAULT_COLORS = ['#4A90D9', '#D94A4A', '#4AD97A', '#D9C74A', '#9B59B6', '#E67E22']

// Visual color mappings for group containers
const COLOR_TO_BG: Record<string, string> = {
  '#4A90D9': 'rgba(74, 144, 217, 0.08)',
  '#D94A4A': 'rgba(217, 74, 74, 0.08)',
  '#4AD97A': 'rgba(74, 217, 122, 0.08)',
  '#D9C74A': 'rgba(217, 199, 74, 0.08)',
  '#9B59B6': 'rgba(155, 89, 182, 0.08)',
  '#E67E22': 'rgba(230, 126, 34, 0.08)',
}

const COLOR_TO_BORDER: Record<string, string> = {
  '#4A90D9': 'rgba(74, 144, 217, 0.30)',
  '#D94A4A': 'rgba(217, 74, 74, 0.30)',
  '#4AD97A': 'rgba(74, 217, 122, 0.30)',
  '#D9C74A': 'rgba(217, 199, 74, 0.30)',
  '#9B59B6': 'rgba(155, 89, 182, 0.30)',
  '#E67E22': 'rgba(230, 126, 34, 0.30)',
}

const COLOR_TO_LABEL: Record<string, string> = {
  '#4A90D9': 'rgba(74, 144, 217, 0.85)',
  '#D94A4A': 'rgba(217, 74, 74, 0.85)',
  '#4AD97A': 'rgba(74, 217, 122, 0.85)',
  '#D9C74A': 'rgba(217, 199, 74, 0.85)',
  '#9B59B6': 'rgba(155, 89, 182, 0.85)',
  '#E67E22': 'rgba(230, 126, 34, 0.85)',
}

export function getGroupBgColor(group: Group): string {
  return COLOR_TO_BG[group.color] ?? 'rgba(255, 255, 255, 0.05)'
}

export function getGroupBorderColor(group: Group): string {
  return COLOR_TO_BORDER[group.color] ?? 'rgba(255, 255, 255, 0.15)'
}

export function getGroupLabelColor(group: Group): string {
  return COLOR_TO_LABEL[group.color] ?? 'rgba(255, 255, 255, 0.7)'
}

export const groupStore = createStore<GroupStore>((set, get) => ({
  groups: new Map(),

  createGroup: (name: string, color?: string): Group => {
    const group: Group = {
      id: uuidv4(),
      name,
      color: color ?? DEFAULT_COLORS[get().groups.size % DEFAULT_COLORS.length],
      memberIds: [],
      collapsed: false,
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    }
    set((state) => {
      const groups = new Map(state.groups)
      groups.set(group.id, group)
      return { groups }
    })
    return group
  },

  removeGroup: (id: string) => {
    const group = get().groups.get(id)
    if (group) {
      // Clear groupId from all member sessions
      for (const memberId of group.memberIds) {
        sessionStore.getState().updateSession(memberId, { groupId: undefined })
      }
    }
    set((state) => {
      const groups = new Map(state.groups)
      groups.delete(id)
      return { groups }
    })
  },

  updateGroup: (id: string, patch: Partial<Omit<Group, 'id'>>) => {
    set((state) => {
      const existing = state.groups.get(id)
      if (!existing) return state
      const groups = new Map(state.groups)
      groups.set(id, { ...existing, ...patch })
      return { groups }
    })
  },

  addMember: (groupId: string, elementId: string) => {
    set((state) => {
      const group = state.groups.get(groupId)
      if (!group) return state
      if (group.memberIds.includes(elementId)) return state
      const groups = new Map(state.groups)
      groups.set(groupId, { ...group, memberIds: [...group.memberIds, elementId] })
      return { groups }
    })
    // Set groupId on the session
    sessionStore.getState().updateSession(elementId, { groupId })
    // Recompute bounding box
    get().recomputeBoundingBox(groupId)
  },

  removeMember: (groupId: string, elementId: string) => {
    set((state) => {
      const group = state.groups.get(groupId)
      if (!group) return state
      const groups = new Map(state.groups)
      groups.set(groupId, {
        ...group,
        memberIds: group.memberIds.filter((id) => id !== elementId),
      })
      return { groups }
    })
    // Clear groupId on the session
    sessionStore.getState().updateSession(elementId, { groupId: undefined })
    // Recompute bounding box
    get().recomputeBoundingBox(groupId)
  },

  toggleCollapsed: (id: string) => {
    set((state) => {
      const group = state.groups.get(id)
      if (!group) return state
      const groups = new Map(state.groups)
      groups.set(id, { ...group, collapsed: !group.collapsed })
      return { groups }
    })
  },

  recomputeBoundingBox: (id: string) => {
    const group = get().groups.get(id)
    if (!group || group.memberIds.length === 0) {
      get().updateGroup(id, { boundingBox: { x: 0, y: 0, width: 0, height: 0 } })
      return
    }

    const sessions = sessionStore.getState().sessions
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const memberId of group.memberIds) {
      const session = sessions.get(memberId)
      if (!session) continue
      minX = Math.min(minX, session.position.x)
      minY = Math.min(minY, session.position.y)
      maxX = Math.max(maxX, session.position.x + session.size.width)
      maxY = Math.max(maxY, session.position.y + session.size.height)
    }

    if (minX === Infinity) {
      get().updateGroup(id, { boundingBox: { x: 0, y: 0, width: 0, height: 0 } })
      return
    }

    get().updateGroup(id, {
      boundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    })
  },
}))

// Clean up group membership when sessions are removed
sessionStore.subscribe((state, prevState) => {
  if (state.sessions === prevState.sessions) return
  const { groups } = groupStore.getState()
  for (const [, group] of groups) {
    for (const memberId of group.memberIds) {
      if (!state.sessions.has(memberId)) {
        groupStore.getState().removeMember(group.id, memberId)
      }
    }
  }
})

export const useGroupList = (): Group[] =>
  useStore(groupStore, useShallow((state) => Array.from(state.groups.values())))

export const useGroup = (id: string): Group | undefined =>
  useStore(groupStore, (state) => state.groups.get(id))

export const useGroupStore = <T>(selector: (state: GroupStore) => T): T =>
  useStore(groupStore, selector)

export function findGroupByElementId(elementId: string): Group | undefined {
  for (const group of groupStore.getState().groups.values()) {
    if (group.memberIds.includes(elementId)) {
      return group
    }
  }
  return undefined
}
