import { sessionStore } from './sessionStore'
import { regionStore } from './regionStore'
import { gridStore } from './gridStore'
import { snapPosition, snapSize } from '../window/useSnapping'

/**
 * Re-snap all sessions and regions to the new grid size with a smooth CSS transition.
 */
export function reSnapAllElements(newGridSize: number): void {
  // Enable CSS transition animation
  gridStore.getState().setResnapping(true)

  // Re-snap all sessions
  const sessions = sessionStore.getState().sessions
  for (const [id, session] of sessions) {
    const newPos = snapPosition(session.position, newGridSize)
    const newSize = snapSize(
      { width: session.size.width, height: session.size.height },
      newGridSize
    )
    sessionStore.getState().updateSession(id, {
      position: newPos,
      size: { ...session.size, width: newSize.width, height: newSize.height },
    })
  }

  // Re-snap all regions
  const regions = regionStore.getState().regions
  const snap = (v: number) => Math.round(v / newGridSize) * newGridSize
  for (const [id, region] of regions) {
    const newPos = snapPosition(region.position, newGridSize)
    regionStore.getState().updateRegion(id, {
      position: newPos,
      size: {
        width: Math.max(newGridSize * 4, snap(region.size.width)),
        height: Math.max(newGridSize * 4, snap(region.size.height)),
      },
    })
  }

  // Remove transition class after animation completes
  setTimeout(() => {
    gridStore.getState().setResnapping(false)
  }, 300)
}
