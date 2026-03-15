export const CHROME_HEIGHT = 32
const DEFAULT_GRID_SIZE = 20
const DEFAULT_MIN_WIDTH_CELLS = 10
const DEFAULT_MIN_HEIGHT_CELLS = 8

export function snap(value: number, gridSize: number = DEFAULT_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize
}

export function snapPosition(
  pos: { x: number; y: number },
  gridSize: number = DEFAULT_GRID_SIZE
): { x: number; y: number } {
  return { x: snap(pos.x, gridSize), y: snap(pos.y, gridSize) }
}

export function snapSize(
  size: { width: number; height: number },
  gridSize: number = DEFAULT_GRID_SIZE,
  minWidthCells: number = DEFAULT_MIN_WIDTH_CELLS,
  minHeightCells: number = DEFAULT_MIN_HEIGHT_CELLS
): { width: number; height: number } {
  const minWidth = minWidthCells * gridSize
  const minHeight = minHeightCells * gridSize
  return {
    width: Math.max(minWidth, snap(size.width, gridSize)),
    height: Math.max(minHeight, snap(size.height, gridSize)),
  }
}

export function nearestGridLines(
  value: number,
  gridSize: number = DEFAULT_GRID_SIZE
): { before: number; after: number } {
  const before = Math.floor(value / gridSize) * gridSize
  const after = before + gridSize
  return { before, after }
}
