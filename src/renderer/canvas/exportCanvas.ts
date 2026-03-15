import { getCanvasRootElement } from './useCanvasControls'

export async function exportCanvasPng(): Promise<void> {
  const root = getCanvasRootElement()
  if (!root) return

  const rect = root.getBoundingClientRect()
  await window.smokeAPI?.canvas.exportPng({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  })
}
