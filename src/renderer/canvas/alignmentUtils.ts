import { sessionStore, type Session } from '../stores/sessionStore'
import { snap } from '../window/useSnapping'

export type AlignmentAction =
  | 'align-left'
  | 'align-right'
  | 'align-top'
  | 'align-bottom'
  | 'align-center-h'
  | 'align-center-v'
  | 'distribute-h'
  | 'distribute-v'

function getSelectedSessions(): Session[] {
  const state = sessionStore.getState()
  const sessions: Session[] = []
  for (const id of state.selectedIds) {
    const s = state.sessions.get(id)
    if (s) sessions.push(s)
  }
  return sessions
}

function applyPosition(id: string, x: number, y: number, gridSize: number): void {
  sessionStore.getState().updateSession(id, {
    position: { x: snap(x, gridSize), y: snap(y, gridSize) },
  })
}

export function executeAlignment(action: AlignmentAction, gridSize: number): void {
  const sessions = getSelectedSessions()
  if (sessions.length < 2) return

  switch (action) {
    case 'align-left': {
      const minX = Math.min(...sessions.map((s) => s.position.x))
      for (const s of sessions) {
        applyPosition(s.id, minX, s.position.y, gridSize)
      }
      break
    }
    case 'align-right': {
      const maxRight = Math.max(...sessions.map((s) => s.position.x + s.size.width))
      for (const s of sessions) {
        applyPosition(s.id, maxRight - s.size.width, s.position.y, gridSize)
      }
      break
    }
    case 'align-top': {
      const minY = Math.min(...sessions.map((s) => s.position.y))
      for (const s of sessions) {
        applyPosition(s.id, s.position.x, minY, gridSize)
      }
      break
    }
    case 'align-bottom': {
      const maxBottom = Math.max(...sessions.map((s) => s.position.y + s.size.height))
      for (const s of sessions) {
        applyPosition(s.id, s.position.x, maxBottom - s.size.height, gridSize)
      }
      break
    }
    case 'align-center-h': {
      const minX = Math.min(...sessions.map((s) => s.position.x))
      const maxRight = Math.max(...sessions.map((s) => s.position.x + s.size.width))
      const centerX = (minX + maxRight) / 2
      for (const s of sessions) {
        applyPosition(s.id, centerX - s.size.width / 2, s.position.y, gridSize)
      }
      break
    }
    case 'align-center-v': {
      const minY = Math.min(...sessions.map((s) => s.position.y))
      const maxBottom = Math.max(...sessions.map((s) => s.position.y + s.size.height))
      const centerY = (minY + maxBottom) / 2
      for (const s of sessions) {
        applyPosition(s.id, s.position.x, centerY - s.size.height / 2, gridSize)
      }
      break
    }
    case 'distribute-h': {
      const sorted = [...sessions].sort((a, b) => a.position.x - b.position.x)
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const totalWidth = sorted.reduce((sum, s) => sum + s.size.width, 0)
      const totalSpan = last.position.x + last.size.width - first.position.x
      const gap = (totalSpan - totalWidth) / (sorted.length - 1)
      let x = first.position.x
      for (const s of sorted) {
        applyPosition(s.id, x, s.position.y, gridSize)
        x += s.size.width + gap
      }
      break
    }
    case 'distribute-v': {
      const sorted = [...sessions].sort((a, b) => a.position.y - b.position.y)
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const totalHeight = sorted.reduce((sum, s) => sum + s.size.height, 0)
      const totalSpan = last.position.y + last.size.height - first.position.y
      const gap = (totalSpan - totalHeight) / (sorted.length - 1)
      let y = first.position.y
      for (const s of sorted) {
        applyPosition(s.id, s.position.x, y, gridSize)
        y += s.size.height + gap
      }
      break
    }
  }
}
