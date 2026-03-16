import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AiStreamCanvasAction } from '../../../preload/types'
import { sessionStore } from '../../stores/sessionStore'
import { connectorStore } from '../../stores/connectorStore'

/**
 * Tests for the canvas action handler logic in useAiCanvasActions.
 *
 * We extract and test the dispatch logic directly rather than rendering
 * the hook, since the hook is just a useEffect wrapper around the handler.
 */

// Mock closeSession — it reaches into window.smokeAPI and terminal registry
vi.mock('../../session/useSessionClose', () => ({
  closeSession: vi.fn(),
}))

// Mock setPanTo — it depends on DOM refs from useCanvasControls
vi.mock('../../canvas/useCanvasControls', () => ({
  setPanTo: vi.fn(),
}))

import { closeSession } from '../../session/useSessionClose'
import { setPanTo } from '../../canvas/useCanvasControls'

// Import the handler module after mocks are set up
// We re-implement the handler inline since it's not exported — test the store effects
function makeEvent(action: string, payload: Record<string, unknown>): AiStreamCanvasAction {
  return {
    type: 'canvas_action',
    conversationId: 'conv-1',
    action: action as AiStreamCanvasAction['action'],
    payload,
  }
}

describe('AI canvas action: session_created', () => {
  beforeEach(() => {
    sessionStore.setState({ sessions: new Map(), focusedId: null, nextZIndex: 1 })
  })

  it('inserts a new terminal session into the store', async () => {
    // Dynamically import to pick up mocks
    const { handleCanvasAction } = await import('../useAiCanvasActions')

    handleCanvasAction(makeEvent('session_created', {
      sessionId: 'ai-sess-1',
      cwd: '/home/user',
      position: { x: 100, y: 200 },
    }))

    const session = sessionStore.getState().sessions.get('ai-sess-1')
    expect(session).toBeDefined()
    expect(session!.type).toBe('terminal')
    expect(session!.position).toEqual({ x: 100, y: 200 })
    expect(session!.id).toBe('ai-sess-1')
    expect(sessionStore.getState().focusedId).toBe('ai-sess-1')
  })

  it('uses custom size when provided', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')

    handleCanvasAction(makeEvent('session_created', {
      sessionId: 'ai-sess-2',
      cwd: '/tmp',
      position: { x: 0, y: 0 },
      size: { cols: 120, rows: 40, width: 960, height: 640 },
    }))

    const session = sessionStore.getState().sessions.get('ai-sess-2')
    expect(session!.size).toEqual({ cols: 120, rows: 40, width: 960, height: 640 })
  })
})

describe('AI canvas action: session_moved', () => {
  beforeEach(() => {
    sessionStore.setState({ sessions: new Map(), focusedId: null, nextZIndex: 1 })
    sessionStore.getState().createSession('/home/user', { x: 0, y: 0 })
  })

  it('updates session position', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')
    const id = Array.from(sessionStore.getState().sessions.keys())[0]

    handleCanvasAction(makeEvent('session_moved', {
      sessionId: id,
      position: { x: 300, y: 400 },
    }))

    const session = sessionStore.getState().sessions.get(id)
    expect(session!.position).toEqual({ x: 300, y: 400 })
  })
})

describe('AI canvas action: session_resized', () => {
  beforeEach(() => {
    sessionStore.setState({ sessions: new Map(), focusedId: null, nextZIndex: 1 })
    sessionStore.getState().createSession('/home/user', { x: 0, y: 0 })
  })

  it('updates session size', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')
    const id = Array.from(sessionStore.getState().sessions.keys())[0]

    handleCanvasAction(makeEvent('session_resized', {
      sessionId: id,
      size: { cols: 100, rows: 30, width: 800, height: 500 },
    }))

    const session = sessionStore.getState().sessions.get(id)
    expect(session!.size).toEqual({ cols: 100, rows: 30, width: 800, height: 500 })
  })
})

describe('AI canvas action: session_closed', () => {
  it('delegates to closeSession', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')

    handleCanvasAction(makeEvent('session_closed', { sessionId: 'sess-to-close' }))

    expect(closeSession).toHaveBeenCalledWith('sess-to-close')
  })
})

describe('AI canvas action: viewport_panned', () => {
  it('calls setPanTo with coordinates', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')

    handleCanvasAction(makeEvent('viewport_panned', { panX: 500, panY: -200 }))

    expect(setPanTo).toHaveBeenCalledWith(500, -200)
  })
})

describe('AI canvas action: note_created', () => {
  beforeEach(() => {
    sessionStore.setState({ sessions: new Map(), focusedId: null, nextZIndex: 1 })
  })

  it('inserts a new note session into the store', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')

    handleCanvasAction(makeEvent('note_created', {
      noteId: 'ai-note-1',
      text: 'Important note',
      position: { x: 200, y: 300 },
      color: 'pink',
    }))

    const session = sessionStore.getState().sessions.get('ai-note-1')
    expect(session).toBeDefined()
    expect(session!.type).toBe('note')
    expect(session!.position).toEqual({ x: 200, y: 300 })
    expect((session as { content: string }).content).toBe('Important note')
    expect((session as { color: string }).color).toBe('pink')
  })

  it('uses default size for notes', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')

    handleCanvasAction(makeEvent('note_created', {
      noteId: 'ai-note-2',
      text: 'Test',
      position: { x: 0, y: 0 },
      color: 'yellow',
    }))

    const session = sessionStore.getState().sessions.get('ai-note-2')
    expect(session!.size).toEqual({ cols: 0, rows: 0, width: 240, height: 200 })
  })
})

describe('AI canvas action: plugin_session_created', () => {
  beforeEach(() => {
    sessionStore.setState({ sessions: new Map(), focusedId: null, nextZIndex: 1 })
  })

  it('creates a plugin session in the store', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')

    handleCanvasAction(makeEvent('plugin_session_created', {
      sessionId: 'ai-plugin-1',
      pluginType: 'plugin:docker-dashboard',
      pluginId: 'docker-dashboard',
      pluginSource: 'global',
      pluginManifest: {
        name: 'docker-dashboard',
        version: '1.0.0',
        entryPoint: 'index.tsx',
        defaultSize: { width: 480, height: 360 },
      },
      pluginData: { containerFilter: 'running' },
      position: { x: 300, y: 400 },
    }))

    // The createPluginSession generates its own ID, so check by type
    const sessions = Array.from(sessionStore.getState().sessions.values())
    const pluginSession = sessions.find((s) => s.type === 'plugin:docker-dashboard')
    expect(pluginSession).toBeDefined()
    expect(pluginSession!.position).toEqual({ x: 300, y: 400 })
    expect((pluginSession as { pluginId: string }).pluginId).toBe('docker-dashboard')
    expect((pluginSession as { pluginData: Record<string, unknown> }).pluginData).toEqual({ containerFilter: 'running' })
  })
})

describe('AI canvas action: connector_created', () => {
  beforeEach(() => {
    connectorStore.setState({ connectors: new Map() })
  })

  it('inserts a new connector into the store', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')

    handleCanvasAction(makeEvent('connector_created', {
      connectorId: 'ai-conn-1',
      sourceId: 'session-a',
      targetId: 'session-b',
      label: 'data flow',
      color: '#ff0000',
    }))

    const connector = connectorStore.getState().connectors.get('ai-conn-1')
    expect(connector).toBeDefined()
    expect(connector!.sourceId).toBe('session-a')
    expect(connector!.targetId).toBe('session-b')
    expect(connector!.label).toBe('data flow')
    expect(connector!.color).toBe('#ff0000')
  })

  it('uses default accent color when color is omitted', async () => {
    const { handleCanvasAction } = await import('../useAiCanvasActions')

    handleCanvasAction(makeEvent('connector_created', {
      connectorId: 'ai-conn-2',
      sourceId: 'a',
      targetId: 'b',
    }))

    const connector = connectorStore.getState().connectors.get('ai-conn-2')
    expect(connector!.color).toBe('var(--accent-strong, #7aa2f7)')
  })
})
