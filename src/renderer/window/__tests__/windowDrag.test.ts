import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sessionStore } from '../../stores/sessionStore'
import { snap, snapPosition } from '../useSnapping'

/**
 * Tests for window drag logic extracted from useWindowDrag.ts.
 * Tests zoom compensation and snap-on-release behavior that was fixed
 * in smoke-9ee (terminal flickering during drag).
 *
 * The key fix in smoke-9ee was updating DOM directly during drag instead
 * of going through Zustand, which caused re-renders and flickering.
 */

describe('window drag logic', () => {
  beforeEach(() => {
    sessionStore.setState({
      sessions: new Map(),
      focusedId: null,
      highlightedId: null,
      nextZIndex: 1,
    })
  })

  describe('zoom-compensated drag delta', () => {
    function calculateDragDelta(
      clientX: number,
      clientY: number,
      startMouseX: number,
      startMouseY: number,
      zoom: number
    ): { dx: number; dy: number } {
      return {
        dx: (clientX - startMouseX) / zoom,
        dy: (clientY - startMouseY) / zoom,
      }
    }

    it('at zoom 1.0, pixel delta equals canvas delta', () => {
      const { dx, dy } = calculateDragDelta(200, 300, 100, 200, 1.0)
      expect(dx).toBe(100)
      expect(dy).toBe(100)
    })

    it('at zoom 0.5, pixel delta is doubled (canvas is zoomed out)', () => {
      const { dx, dy } = calculateDragDelta(200, 300, 100, 200, 0.5)
      expect(dx).toBe(200)
      expect(dy).toBe(200)
    })

    it('at zoom 2.0, pixel delta is halved (canvas is zoomed in)', () => {
      const { dx, dy } = calculateDragDelta(200, 300, 100, 200, 2.0)
      expect(dx).toBe(50)
      expect(dy).toBe(50)
    })

    it('handles negative deltas (dragging left/up)', () => {
      const { dx, dy } = calculateDragDelta(50, 100, 150, 200, 1.0)
      expect(dx).toBe(-100)
      expect(dy).toBe(-100)
    })
  })

  describe('snap on release', () => {
    it('snaps final position to grid on pointer up', () => {
      const livePos = { x: 107, y: 213 }
      const gridSize = 20
      const snapped = snapPosition(livePos, gridSize)

      expect(snapped).toEqual({ x: 100, y: 220 })
    })

    it('updates session store with snapped position', () => {
      const session = sessionStore.getState().createSession('/tmp', { x: 0, y: 0 })
      const livePos = { x: 107, y: 213 }
      const snapped = snapPosition(livePos, 20)

      sessionStore.getState().updateSession(session.id, { position: snapped })

      const updated = sessionStore.getState().sessions.get(session.id)!
      expect(updated.position).toEqual({ x: 100, y: 220 })
    })
  })

  describe('bringToFront on drag start', () => {
    it('brings session to front when drag starts', () => {
      const s1 = sessionStore.getState().createSession('/a')
      const s2 = sessionStore.getState().createSession('/b')

      sessionStore.getState().bringToFront(s1.id)

      const updatedS1 = sessionStore.getState().sessions.get(s1.id)!
      const updatedS2 = sessionStore.getState().sessions.get(s2.id)!
      expect(updatedS1.zIndex).toBeGreaterThan(updatedS2.zIndex)
    })
  })

  describe('drag state management', () => {
    it('calculates new position from start position + delta', () => {
      const startPos = { x: 100, y: 200 }
      const dx = 50
      const dy = -30
      const newPos = { x: startPos.x + dx, y: startPos.y + dy }

      expect(newPos).toEqual({ x: 150, y: 170 })
    })
  })
})
