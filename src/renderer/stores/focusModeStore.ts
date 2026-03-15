import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
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
  const focusedId = useStore(sessionStore, (s) => s.focusedId)
  const connectors = useStore(
    connectorStore,
    useShallow((s) => Array.from(s.connectors.values()))
  )

  if (!enabled || !focusedId) return null

  const activeIds = new Set<string>([focusedId])
  for (const c of connectors) {
    if (c.sourceId === focusedId || c.targetId === focusedId) {
      activeIds.add(c.sourceId)
      activeIds.add(c.targetId)
    }
  }
  return activeIds
}
