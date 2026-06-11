import { useMemo } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { connectorStore } from './connectorStore'
import { sessionStore } from './sessionStore'

interface FocusModeState {
  enabled: boolean
  toggle: () => void
}

export const focusModeStore = createStore<FocusModeState>((set, get) => ({
  enabled: false,
  toggle: () => set({ enabled: !get().enabled }),
}))

export const useFocusModeEnabled = (): boolean =>
  useStore(focusModeStore, (s) => s.enabled)

/**
 * Returns the set of element IDs that should remain fully visible in focus mode.
 * Includes the focused element and all elements connected to it via arrows.
 * Returns null when focus mode is inactive or nothing is focused.
 */
export function useFocusModeActiveIds(): Set<string> | null {
  const enabled = useFocusModeEnabled()
  // Gate the selectors on `enabled` so that with focus mode off (the common
  // case) they return constants — focus changes and connector churn don't
  // re-render consumers at all.
  const focusedId = useStore(sessionStore, (s) => (enabled ? s.focusedId : null))
  const connectorsMap = useStore(connectorStore, (s) =>
    enabled && focusedId ? s.connectors : null
  )

  return useMemo(() => {
    if (!enabled || !focusedId || !connectorsMap) return null
    const activeIds = new Set<string>([focusedId])
    for (const c of connectorsMap.values()) {
      if (c.sourceId === focusedId || c.targetId === focusedId) {
        activeIds.add(c.sourceId)
        activeIds.add(c.targetId)
      }
    }
    return activeIds
  }, [enabled, focusedId, connectorsMap])
}

/**
 * Per-window dimming flag for focus mode.
 *
 * Returns primitives from every selector, so a window re-renders only when
 * its own dim state flips. With focus mode off (the common case) the
 * selectors return constants — focus/connector churn re-renders nothing.
 * The Set-returning useFocusModeActiveIds re-rendered every window on every
 * focus change AND every connector change, even with focus mode off.
 */
export function useIsDimmedByFocusMode(sessionId: string): boolean {
  const enabled = useFocusModeEnabled()
  const focusedId = useStore(sessionStore, (s) => (enabled ? s.focusedId : null))
  return useStore(connectorStore, (s) => {
    if (!enabled || !focusedId) return false
    if (sessionId === focusedId) return false
    for (const c of s.connectors.values()) {
      if (
        (c.sourceId === focusedId && c.targetId === sessionId) ||
        (c.targetId === focusedId && c.sourceId === sessionId)
      ) {
        return false
      }
    }
    return true
  })
}
