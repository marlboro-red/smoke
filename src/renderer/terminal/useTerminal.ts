import { useRef, useEffect, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

const TERMINAL_OPTIONS = {
  cursorBlink: true,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  scrollback: 10000,
  allowTransparency: false,
  theme: {
    background: '#1a1a2e',
    foreground: '#e0e0e0',
  },
}

export function calculateTerminalSize(
  widthPx: number,
  heightPx: number,
  charWidth: number,
  charHeight: number
): { cols: number; rows: number } {
  return {
    cols: Math.max(2, Math.floor(widthPx / charWidth)),
    rows: Math.max(1, Math.floor(heightPx / charHeight)),
  }
}

interface UseTerminalResult {
  terminalRef: React.MutableRefObject<Terminal | null>
  getSnapshot: () => string[]
  charDims: React.MutableRefObject<{ width: number; height: number }>
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  cols?: number,
  rows?: number
): UseTerminalResult {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const charDims = useRef({ width: 0, height: 0 })

  const getSnapshot = useCallback((): string[] => {
    const terminal = terminalRef.current
    if (!terminal) return []
    const buffer = terminal.buffer.active
    const lines: string[] = []
    const startRow = Math.max(0, buffer.cursorY - 5)
    for (let i = startRow; i <= buffer.cursorY; i++) {
      lines.push(buffer.getLine(i)?.translateToString() || '')
    }
    return lines
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal({
      ...TERMINAL_OPTIONS,
      cols: cols ?? 80,
      rows: rows ?? 24,
    })
    terminalRef.current = terminal

    // Load FitAddon for initial sizing
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)

    // Open terminal into container
    terminal.open(container)

    // Measure character dimensions once at creation and cache them.
    // This avoids the CSS-transform getBoundingClientRect() issue.
    const cellEl = container.querySelector('.xterm-char-measure-element')
    if (cellEl) {
      const rect = cellEl.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        charDims.current = { width: rect.width, height: rect.height }
      }
    }
    // Fallback: estimate from font metrics if DOM measurement failed
    if (charDims.current.width === 0) {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.font = `${TERMINAL_OPTIONS.fontSize}px ${TERMINAL_OPTIONS.fontFamily}`
        const metrics = ctx.measureText('W')
        charDims.current = {
          width: metrics.width,
          height: TERMINAL_OPTIONS.fontSize * TERMINAL_OPTIONS.lineHeight,
        }
      }
    }

    // Initial fit
    try {
      fitAddon.fit()
    } catch {
      // fit may fail if container has zero dimensions
    }

    // Load WebGL addon AFTER open (requires canvas context)
    try {
      const webglAddon = new WebglAddon()
      webglAddonRef.current = webglAddon

      // Handle WebGL context loss — dispose addon, xterm falls back to canvas renderer
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
        webglAddonRef.current = null
      })

      terminal.loadAddon(webglAddon)
    } catch {
      // WebGL not available — xterm uses canvas renderer automatically
      webglAddonRef.current = null
    }

    return () => {
      if (webglAddonRef.current) {
        webglAddonRef.current.dispose()
        webglAddonRef.current = null
      }
      if (fitAddonRef.current) {
        fitAddonRef.current.dispose()
        fitAddonRef.current = null
      }
      terminal.dispose()
      terminalRef.current = null
    }
  }, [containerRef, cols, rows])

  return { terminalRef, getSnapshot, charDims }
}
