import { sessionStore, findImageSessionByPath } from '../stores/sessionStore'
import { gridStore } from '../stores/gridStore'
import { getCurrentPan, getCurrentZoom, getCanvasRootElement } from '../canvas/useCanvasControls'
import { panToSession } from '../sidebar/useSidebarSync'

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico',
])

export function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.has(ext)
}

function getViewportCenter(): { x: number; y: number } {
  const rootEl = getCanvasRootElement()
  if (!rootEl) return { x: 100, y: 100 }

  const rect = rootEl.getBoundingClientRect()
  const pan = getCurrentPan()
  const zoom = getCurrentZoom()

  const canvasX = (rect.width / 2 - pan.x) / zoom
  const canvasY = (rect.height / 2 - pan.y) / zoom

  return { x: canvasX, y: canvasY }
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

export async function createImageSession(
  filePath: string,
  position?: { x: number; y: number }
): Promise<void> {
  const { snapToGrid } = gridStore.getState()

  const rawPos = position ?? getViewportCenter()
  const snappedPos = {
    x: snapToGrid(rawPos.x),
    y: snapToGrid(rawPos.y),
  }

  const result = await window.smokeAPI.fs.readfileBase64(filePath)
  const dims = await loadImageDimensions(result.dataUrl)

  const session = sessionStore.getState().createImageSession(
    filePath,
    result.dataUrl,
    dims.width,
    dims.height,
    snappedPos
  )

  sessionStore.getState().focusSession(session.id)
  sessionStore.getState().bringToFront(session.id)
}

export function openImageOrPanToExisting(filePath: string): void {
  const existing = findImageSessionByPath(filePath)
  if (existing) {
    panToSession(existing.id)
  } else {
    createImageSession(filePath)
  }
}
