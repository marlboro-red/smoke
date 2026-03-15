import { useRef, useEffect, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import {
  getTerminal,
  registerTerminal,
  markHidden,
  reattachTerminal,
} from './terminalRegistry'
import { sessionStore } from '../stores/sessionStore'
import { getCurrentTheme } from '../themes/applyTheme'

const TERMINAL_OPTIONS = {
  cursorBlink: true,
  fontFamily: '"Berkeley Mono", "Symbols Nerd Font", Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  scrollback: 10000,
  allowTransparency: false,
}

/** Total horizontal + vertical padding inside the .xterm element (4px each side) */
export const XTERM_PADDING = 8

export function calculateTerminalSize(
  widthPx: number,
  heightPx: number,
  charWidth: number,
  charHeight: number
): { cols: number; rows: number } {
  return {
    cols: Math.max(2, Math.floor((widthPx - XTERM_PADDING) / charWidth)),
    rows: Math.max(1, Math.floor((heightPx - XTERM_PADDING) / charHeight)),
  }
}

interface UseTerminalResult {
  terminalRef: React.MutableRefObject<Terminal | null>
  getSnapshot: () => string[]
  charDims: React.MutableRefObject<{ width: number; height: number }>
}

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  sessionId: string,
  cols?: number,
  rows?: number
): UseTerminalResult {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
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

    // Check if there's an existing terminal in the registry (reattach case)
    const existing = getTerminal(sessionId)
    if (existing) {
      const terminal = reattachTerminal(sessionId, container)
      if (!terminal) return

      terminalRef.current = terminal
      charDims.current = existing.charDims

      // Load FitAddon for this mount
      const fitAddon = new FitAddon()
      fitAddonRef.current = fitAddon
      terminal.loadAddon(fitAddon)
      try {
        fitAddon.fit()
        // Sync PTY dimensions after fit — the container size may have
        // changed while the terminal was off-screen.
        if (window.smokeAPI?.pty?.resize) {
          window.smokeAPI.pty.resize(sessionId, terminal.cols, terminal.rows)
        }
      } catch {
        // fit may fail if container has zero dimensions
      }
      // Force full redraw of the buffer after reattach + fit
      terminal.refresh(0, terminal.rows - 1)
    } else {
      // Create new terminal
      const terminal = new Terminal({
        ...TERMINAL_OPTIONS,
        theme: getCurrentTheme().xtermTheme,
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
        // Sync PTY dimensions — fit may have changed cols/rows from the
        // values passed to spawn, causing the PTY to format output for the
        // wrong terminal width and overwrite existing content.
        if (window.smokeAPI?.pty?.resize) {
          window.smokeAPI.pty.resize(sessionId, terminal.cols, terminal.rows)
        }
      } catch {
        // fit may fail if container has zero dimensions
      }

      // Load WebGL addon AFTER open (requires canvas context)
      let webglAddon: WebglAddon | null = null
      try {
        webglAddon = new WebglAddon()

        // Handle WebGL context loss — dispose addon, xterm falls back to canvas renderer
        webglAddon.onContextLoss(() => {
          webglAddon?.dispose()
          webglAddon = null
          // Update registry
          const entry = getTerminal(sessionId)
          if (entry) entry.webglAddon = null
        })

        terminal.loadAddon(webglAddon)
      } catch {
        // WebGL not available — xterm uses canvas renderer automatically
        webglAddon = null
      }

      // Register in the terminal registry
      registerTerminal(sessionId, terminal, webglAddon, charDims.current)
    }

    // ResizeObserver: auto-fit terminal when container size changes (e.g. window resize drag).
    // This replaces the old pattern of re-running the entire effect on cols/rows changes,
    // which caused a destructive terminal.open() call via the reattach path.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const fit = fitAddonRef.current
        const term = terminalRef.current
        if (!fit || !term) return
        try {
          fit.fit()
          const newCols = term.cols
          const newRows = term.rows
          const session = sessionStore.getState().sessions.get(sessionId)
          if (session && (session.size.cols !== newCols || session.size.rows !== newRows)) {
            sessionStore.getState().updateSession(sessionId, {
              size: { ...session.size, cols: newCols, rows: newRows },
            })
            window.smokeAPI?.pty?.resize(sessionId, newCols, newRows)
          }
        } catch {
          // fit may fail if container has zero dimensions
        }
      }, 50)
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      if (resizeTimer) clearTimeout(resizeTimer)
      // On unmount: mark hidden but don't dispose (keep scrollback)
      if (fitAddonRef.current) {
        fitAddonRef.current.dispose()
        fitAddonRef.current = null
      }
      markHidden(sessionId)
      terminalRef.current = null
    }
    // cols and rows are intentionally excluded — they are only used for initial terminal
    // creation. Subsequent size changes are handled by the ResizeObserver above, which
    // avoids the destructive terminal.open() call that the reattach path would trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, sessionId])

  return { terminalRef, getSnapshot, charDims }
}
