import { useRef, useEffect, useCallback } from 'react'
import { sessionStore, useSessionList } from '../stores/sessionStore'
import { useCanvasStore, canvasStore } from '../stores/canvasStore'
import { setPanTo, getCanvasRootElement } from './useCanvasControls'
import '../styles/minimap.css'

const MINIMAP_WIDTH = 180
const MINIMAP_HEIGHT = 120
const PADDING = 20

const TYPE_COLORS: Record<string, string> = {
  terminal: 'rgba(124, 140, 245, 0.8)', // accent
  file: 'rgba(74, 222, 128, 0.8)',      // green
  note: 'rgba(251, 191, 36, 0.8)',      // yellow
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function computeBounds(
  sessions: ReturnType<typeof useSessionList>,
  vpLeft: number,
  vpTop: number,
  vpRight: number,
  vpBottom: number
): Bounds {
  let minX = vpLeft
  let minY = vpTop
  let maxX = vpRight
  let maxY = vpBottom

  for (const s of sessions) {
    minX = Math.min(minX, s.position.x)
    minY = Math.min(minY, s.position.y)
    maxX = Math.max(maxX, s.position.x + s.size.width)
    maxY = Math.max(maxY, s.position.y + s.size.height)
  }

  return { minX: minX - PADDING, minY: minY - PADDING, maxX: maxX + PADDING, maxY: maxY + PADDING }
}

export default function Minimap(): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessions = useSessionList()
  const panX = useCanvasStore((s) => s.panX)
  const panY = useCanvasStore((s) => s.panY)
  const zoom = useCanvasStore((s) => s.zoom)

  // Store latest bounds for click handler
  const boundsRef = useRef<Bounds>({ minX: 0, minY: 0, maxX: 1, maxY: 1 })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = MINIMAP_WIDTH * dpr
    canvas.height = MINIMAP_HEIGHT * dpr
    ctx.scale(dpr, dpr)

    // Compute viewport in canvas coordinates
    const root = getCanvasRootElement()
    const rootRect = root?.getBoundingClientRect()
    const rootW = rootRect?.width ?? window.innerWidth
    const rootH = rootRect?.height ?? window.innerHeight
    const vpLeft = -panX / zoom
    const vpTop = -panY / zoom
    const vpRight = vpLeft + rootW / zoom
    const vpBottom = vpTop + rootH / zoom

    const allSessions = Array.from(sessionStore.getState().sessions.values())
    const bounds = computeBounds(allSessions, vpLeft, vpTop, vpRight, vpBottom)
    boundsRef.current = bounds

    const worldW = bounds.maxX - bounds.minX
    const worldH = bounds.maxY - bounds.minY
    if (worldW <= 0 || worldH <= 0) return

    const scale = Math.min(MINIMAP_WIDTH / worldW, MINIMAP_HEIGHT / worldH)
    const offsetX = (MINIMAP_WIDTH - worldW * scale) / 2
    const offsetY = (MINIMAP_HEIGHT - worldH * scale) / 2

    // Clear
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT)

    // Draw elements
    for (const s of allSessions) {
      const x = (s.position.x - bounds.minX) * scale + offsetX
      const y = (s.position.y - bounds.minY) * scale + offsetY
      const w = Math.max(s.size.width * scale, 2)
      const h = Math.max(s.size.height * scale, 2)
      ctx.fillStyle = TYPE_COLORS[s.type] || 'rgba(255,255,255,0.5)'
      ctx.fillRect(x, y, w, h)
    }

    // Draw viewport rectangle
    const vx = (vpLeft - bounds.minX) * scale + offsetX
    const vy = (vpTop - bounds.minY) * scale + offsetY
    const vw = (vpRight - vpLeft) * scale
    const vh = (vpBottom - vpTop) * scale
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(vx, vy, vw, vh)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.fillRect(vx, vy, vw, vh)
  }, [panX, panY, zoom, sessions])

  useEffect(() => {
    draw()
  }, [draw])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      const bounds = boundsRef.current
      const worldW = bounds.maxX - bounds.minX
      const worldH = bounds.maxY - bounds.minY
      if (worldW <= 0 || worldH <= 0) return

      const scale = Math.min(MINIMAP_WIDTH / worldW, MINIMAP_HEIGHT / worldH)
      const offsetX = (MINIMAP_WIDTH - worldW * scale) / 2
      const offsetY = (MINIMAP_HEIGHT - worldH * scale) / 2

      // Convert click to canvas (world) coordinates
      const worldX = (clickX - offsetX) / scale + bounds.minX
      const worldY = (clickY - offsetY) / scale + bounds.minY

      // Center viewport on clicked point
      const root = getCanvasRootElement()
      const rootRect = root?.getBoundingClientRect()
      const rootW = rootRect?.width ?? window.innerWidth
      const rootH = rootRect?.height ?? window.innerHeight
      const zoom = canvasStore.getState().zoom

      const newPanX = -worldX * zoom + rootW / 2
      const newPanY = -worldY * zoom + rootH / 2
      setPanTo(newPanX, newPanY)
    },
    []
  )

  if (sessions.length === 0) return null

  return (
    <div className="minimap-container">
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        onClick={handleClick}
      />
    </div>
  )
}
