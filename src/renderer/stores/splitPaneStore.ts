import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export type SplitDirection = 'horizontal' | 'vertical'

export interface SplitLeaf {
  type: 'leaf'
  paneId: string
}

export interface SplitBranch {
  type: 'branch'
  direction: SplitDirection
  ratio: number
  first: SplitNode
  second: SplitNode
}

export type SplitNode = SplitLeaf | SplitBranch

function countLeaves(node: SplitNode): number {
  if (node.type === 'leaf') return 1
  return countLeaves(node.first) + countLeaves(node.second)
}

function findLeaf(node: SplitNode, paneId: string): boolean {
  if (node.type === 'leaf') return node.paneId === paneId
  return findLeaf(node.first, paneId) || findLeaf(node.second, paneId)
}

export function getAllPaneIds(node: SplitNode): string[] {
  if (node.type === 'leaf') return [node.paneId]
  return [...getAllPaneIds(node.first), ...getAllPaneIds(node.second)]
}

function removeLeaf(node: SplitNode, paneId: string): SplitNode | null {
  if (node.type === 'leaf') return null
  if (node.first.type === 'leaf' && node.first.paneId === paneId) return node.second
  if (node.second.type === 'leaf' && node.second.paneId === paneId) return node.first
  const firstResult = removeLeaf(node.first, paneId)
  if (firstResult) return { ...node, first: firstResult }
  const secondResult = removeLeaf(node.second, paneId)
  if (secondResult) return { ...node, second: secondResult }
  return null
}

function splitLeaf(
  node: SplitNode,
  paneId: string,
  direction: SplitDirection,
  newPaneId: string
): SplitNode {
  if (node.type === 'leaf') {
    if (node.paneId === paneId) {
      return {
        type: 'branch',
        direction,
        ratio: 0.5,
        first: { type: 'leaf', paneId },
        second: { type: 'leaf', paneId: newPaneId },
      }
    }
    return node
  }
  return {
    ...node,
    first: splitLeaf(node.first, paneId, direction, newPaneId),
    second: splitLeaf(node.second, paneId, direction, newPaneId),
  }
}

export type NavDirection = 'left' | 'right' | 'up' | 'down'

function getFirstLeaf(node: SplitNode): string {
  if (node.type === 'leaf') return node.paneId
  return getFirstLeaf(node.first)
}

function getLastLeaf(node: SplitNode): string {
  if (node.type === 'leaf') return node.paneId
  return getLastLeaf(node.second)
}

/**
 * Navigate from the current pane in the given direction.
 * Returns the target pane ID, or null if no navigation is possible.
 */
function navigateInTree(
  node: SplitNode,
  currentPaneId: string,
  direction: NavDirection
): string | null {
  if (node.type === 'leaf') return null

  const splitDir: SplitDirection =
    direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical'
  const goToSecond = direction === 'right' || direction === 'down'

  if (node.direction === splitDir) {
    const inFirst = findLeaf(node.first, currentPaneId)
    const inSecond = findLeaf(node.second, currentPaneId)

    if (inFirst && goToSecond) {
      return getFirstLeaf(node.second)
    }
    if (inSecond && !goToSecond) {
      return getLastLeaf(node.first)
    }
  }

  // Recurse into the subtree containing the current pane
  if (findLeaf(node.first, currentPaneId)) {
    return navigateInTree(node.first, currentPaneId, direction)
  }
  if (findLeaf(node.second, currentPaneId)) {
    return navigateInTree(node.second, currentPaneId, direction)
  }

  return null
}

interface SplitPaneStore {
  trees: Map<string, SplitNode>
  focusedPanes: Map<string, string>

  getTree: (sessionId: string) => SplitNode | undefined
  getFocusedPane: (sessionId: string) => string
  setFocusedPane: (sessionId: string, paneId: string) => void
  split: (sessionId: string, direction: SplitDirection) => string | null
  closePane: (sessionId: string, paneId: string) => { remaining: SplitNode | null }
  navigate: (sessionId: string, direction: NavDirection) => string | null
  cleanupSession: (sessionId: string) => string[]
  getPaneCount: (sessionId: string) => number
  isSplit: (sessionId: string) => boolean
}

export const splitPaneStore = createStore<SplitPaneStore>((set, get) => ({
  trees: new Map(),
  focusedPanes: new Map(),

  getTree: (sessionId) => get().trees.get(sessionId),

  getFocusedPane: (sessionId) => get().focusedPanes.get(sessionId) || sessionId,

  setFocusedPane: (sessionId, paneId) => {
    set((state) => {
      const focusedPanes = new Map(state.focusedPanes)
      focusedPanes.set(sessionId, paneId)
      return { focusedPanes }
    })
  },

  split: (sessionId, direction) => {
    const state = get()
    let tree = state.trees.get(sessionId)

    if (!tree) {
      tree = { type: 'leaf', paneId: sessionId }
    }

    if (countLeaves(tree) >= 4) return null

    const focusedPaneId = state.focusedPanes.get(sessionId) || sessionId
    const newPaneId = uuidv4()
    const newTree = splitLeaf(tree, focusedPaneId, direction, newPaneId)

    set((state) => {
      const trees = new Map(state.trees)
      trees.set(sessionId, newTree)
      const focusedPanes = new Map(state.focusedPanes)
      focusedPanes.set(sessionId, newPaneId)
      return { trees, focusedPanes }
    })

    return newPaneId
  },

  closePane: (sessionId, paneId) => {
    const tree = get().trees.get(sessionId)
    if (!tree || tree.type === 'leaf') {
      return { remaining: null }
    }

    const newTree = removeLeaf(tree, paneId)
    if (!newTree) {
      return { remaining: null }
    }

    set((state) => {
      const trees = new Map(state.trees)
      const focusedPanes = new Map(state.focusedPanes)

      if (newTree.type === 'leaf') {
        trees.delete(sessionId)
        focusedPanes.set(sessionId, newTree.paneId)
      } else {
        trees.set(sessionId, newTree)
        const remainingIds = getAllPaneIds(newTree)
        if (remainingIds.length > 0) {
          focusedPanes.set(sessionId, remainingIds[0])
        }
      }
      return { trees, focusedPanes }
    })

    return { remaining: newTree }
  },

  navigate: (sessionId, direction) => {
    const tree = get().trees.get(sessionId)
    if (!tree) return null

    const focusedPaneId = get().focusedPanes.get(sessionId) || sessionId
    const target = navigateInTree(tree, focusedPaneId, direction)

    if (target) {
      set((state) => {
        const focusedPanes = new Map(state.focusedPanes)
        focusedPanes.set(sessionId, target)
        return { focusedPanes }
      })
    }

    return target
  },

  cleanupSession: (sessionId) => {
    const tree = get().trees.get(sessionId)
    const paneIds = tree ? getAllPaneIds(tree).filter((id) => id !== sessionId) : []

    set((state) => {
      const trees = new Map(state.trees)
      const focusedPanes = new Map(state.focusedPanes)
      trees.delete(sessionId)
      focusedPanes.delete(sessionId)
      return { trees, focusedPanes }
    })

    return paneIds
  },

  getPaneCount: (sessionId) => {
    const tree = get().trees.get(sessionId)
    if (!tree) return 1
    return countLeaves(tree)
  },

  isSplit: (sessionId) => get().trees.has(sessionId),
}))

export const useSplitPaneStore = <T>(selector: (state: SplitPaneStore) => T): T =>
  useStore(splitPaneStore, selector)
