import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AiStreamCanvasAction } from '../../../preload/types'
import { sessionStore } from '../../stores/sessionStore'

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
