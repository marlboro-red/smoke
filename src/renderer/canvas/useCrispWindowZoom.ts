import { useEffect, useRef, useState } from 'react'
import { canvasStore } from '../stores/canvasStore'

const SETTLE_DELAY = 300
const CRISP_THRESHOLD = 1.05

/**
 * Returns the current crisp zoom factor for canvas window elements.
 *
 * When the canvas zoom settles above the threshold, returns the zoom value.
 * Window components apply CSS `zoom` + counter-`scale(1/zoom)` on their outer
 * container so the browser re-rasterizes all text and UI at native resolution
 * for the current zoom level, eliminating the blurriness caused by the canvas
 * viewport's GPU-composited `translate3d() scale()` transform.
 *
 * Returns 1 when crisp zoom is inactive.
 */
export function useCrispWindowZoom(): number {
  const [crispZoom, setCrispZoom] = useState(() => {
    const z = canvasStore.getState().zoom
    return z > CRISP_THRESHOLD ? z : 1
  })
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsub = canvasStore.subscribe((state, prev) => {
      if (state.zoom === prev.zoom) return
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(() => {
        const newVal = state.zoom > CRISP_THRESHOLD ? state.zoom : 1
        setCrispZoom((prev) => (prev === newVal ? prev : newVal))
      }, SETTLE_DELAY)
    })

    return () => {
      unsub()
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [])

  return crispZoom
}

/**
 * Build inline styles for a crisp-zoomed window container.
 * CSS zoom re-rasterizes all content at zoom× resolution; transform
 * scale(1/zoom) keeps the visual size unchanged.
 */
export function crispWindowStyles(crispZoom: number): React.CSSProperties {
  if (crispZoom <= 1) return {}
  return {
    zoom: crispZoom,
    transform: `scale(${1 / crispZoom})`,
    transformOrigin: '0 0',
  }
}
