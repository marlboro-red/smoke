import { useEffect, useRef } from 'react'
import { canvasStore } from '../stores/canvasStore'
import { preferencesStore } from '../stores/preferencesStore'
import type { Terminal } from '@xterm/xterm'

const SETTLE_DELAY = 300
const CRISP_THRESHOLD = 1.05

/**
 * After the canvas zoom settles above 1.0, inflates the terminal container and
 * increases the xterm font size proportionally so xterm.js renders at native
 * resolution for the current zoom level. A CSS counter-scale on the container
 * keeps the visual size unchanged.
 *
 * Because both the container dimensions and the cell dimensions scale by the
 * same factor, FitAddon calculates the same cols/rows — no PTY resize occurs.
 *
 * During zoom animation the crisp settings stay in place (the viewport
 * scale(zoom) on top of the counter-scale always produces the correct visual
 * size regardless of the crisp zoom factor), so there is no jank from
 * fontSize toggling.
 */
export function useCrispZoom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  terminalRef: React.MutableRefObject<Terminal | null>
): void {
  const crispZoomRef = useRef(1)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function applyCrisp(zoom: number): void {
      const container = containerRef.current
      const terminal = terminalRef.current
      if (!container || !terminal) return

      const baseFontSize = preferencesStore.getState().preferences.fontSize || 13

      // Scale the .xterm padding together with the container so the
      // padding-to-cell ratio stays constant, preventing off-by-one
      // col/row differences from the fixed XTERM_PADDING.
      const xtermEl = container.querySelector('.xterm') as HTMLElement | null

      if (zoom > CRISP_THRESHOLD) {
        terminal.options.fontSize = Math.round(baseFontSize * zoom)
        container.style.width = `${zoom * 100}%`
        container.style.height = `${zoom * 100}%`
        container.style.transform = `scale(${1 / zoom})`
        container.style.transformOrigin = '0 0'
        if (xtermEl) xtermEl.style.padding = `${4 * zoom}px`
        crispZoomRef.current = zoom
      } else if (crispZoomRef.current !== 1) {
        terminal.options.fontSize = baseFontSize
        container.style.width = ''
        container.style.height = ''
        container.style.transform = ''
        container.style.transformOrigin = ''
        if (xtermEl) xtermEl.style.padding = ''
        crispZoomRef.current = 1
      }
    }

    const unsub = canvasStore.subscribe((state, prev) => {
      if (state.zoom === prev.zoom) return

      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(() => {
        applyCrisp(state.zoom)
      }, SETTLE_DELAY)
    })

    // Apply immediately if the canvas is already zoomed in
    const initialZoom = canvasStore.getState().zoom
    if (initialZoom > CRISP_THRESHOLD) {
      applyCrisp(initialZoom)
    }

    return () => {
      unsub()
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      // Revert on unmount
      if (crispZoomRef.current !== 1) {
        applyCrisp(1)
      }
    }
  }, [containerRef, terminalRef])
}
