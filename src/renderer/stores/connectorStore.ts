import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { v4 as uuidv4 } from 'uuid'

export interface Connector {
  id: string
  sourceId: string
  targetId: string
  label?: string
  color: string
}

interface ConnectorStore {
  connectors: Map<string, Connector>

  addConnector: (sourceId: string, targetId: string, opts?: { label?: string; color?: string }) => Connector
  removeConnector: (id: string) => void
  updateConnector: (id: string, patch: Partial<Pick<Connector, 'label' | 'color'>>) => void
  removeConnectorsForElement: (elementId: string) => void
}

export const connectorStore = createStore<ConnectorStore>((set, get) => ({
  connectors: new Map(),

  addConnector: (sourceId, targetId, opts) => {
    const connector: Connector = {
      id: uuidv4(),
      sourceId,
      targetId,
      label: opts?.label,
      color: opts?.color ?? 'var(--accent-strong, #7aa2f7)',
    }
    set((state) => {
      const connectors = new Map(state.connectors)
      connectors.set(connector.id, connector)
      return { connectors }
    })
    return connector
  },

  removeConnector: (id) => {
    set((state) => {
      const connectors = new Map(state.connectors)
      connectors.delete(id)
      return { connectors }
    })
  },

  updateConnector: (id, patch) => {
    set((state) => {
      const existing = state.connectors.get(id)
      if (!existing) return state
      const connectors = new Map(state.connectors)
      connectors.set(id, { ...existing, ...patch })
      return { connectors }
    })
  },

  removeConnectorsForElement: (elementId) => {
    set((state) => {
      const connectors = new Map(state.connectors)
      for (const [id, c] of connectors) {
        if (c.sourceId === elementId || c.targetId === elementId) {
          connectors.delete(id)
        }
      }
      return { connectors }
    })
  },
}))

export const useConnectorList = (): Connector[] =>
  useStore(connectorStore, useShallow((state) => Array.from(state.connectors.values())))

export const useConnectorStore = <T>(selector: (state: ConnectorStore) => T): T =>
  useStore(connectorStore, selector)
