import { useRef, useEffect } from 'react'
import { useTerminal } from './useTerminal'
import { usePty } from './usePty'
import { useCrispZoom } from './useCrispZoom'
import { useFocusedId, sessionStore } from '../stores/sessionStore'
import { resolveShortcut } from '../shortcuts/shortcutMap'
import '@xterm/xterm/css/xterm.css'
import '../styles/terminal.css'

interface TerminalWidgetProps {
  sessionId: string
  cols?: number
  rows?: number
  isFocused?: boolean
  onCharDims?: (dims: { width: number; height: number }) => void
  onSnapshot?: (getSnapshot: () => string[]) => void
}

export default function TerminalWidget({ sessionId, cols, rows, isFocused: isFocusedProp, onCharDims, onSnapshot }: TerminalWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { terminalRef, getSnapshot, charDims } = useTerminal(containerRef, sessionId, cols, rows)
  usePty(sessionId, terminalRef)
  useCrispZoom(containerRef, terminalRef)

  const focusedId = useFocusedId()
  const derivedFocused = isFocusedProp !== undefined ? isFocusedProp : focusedId === sessionId

  // Expose getSnapshot to parent
  useEffect(() => {
    if (onSnapshot) {
      onSnapshot(getSnapshot)
    }
  }, [onSnapshot, getSnapshot])

  // Report charDims to parent when measured
  useEffect(() => {
    if (onCharDims && charDims.current.width > 0) {
      onCharDims(charDims.current)
    }
  }, [onCharDims, charDims])

  // Focus/blur xterm.js based on derived focus state
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    if (derivedFocused) {
      terminal.focus()
    } else {
      terminal.blur()
    }
  }, [derivedFocused, terminalRef])

  // Intercept shortcut keys before xterm.js processes them
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Only intercept keydown, not keyup
      if (event.type !== 'keydown') return true

      // Escape: unfocus terminal
      if (event.key === 'Escape') {
        sessionStore.getState().focusSession(null)
        return false
      }

      // Modifier shortcuts: let the capture-phase document handler handle them
      if (event.metaKey || event.ctrlKey) {
        const action = resolveShortcut(event)
        if (action) {
          return false // prevent xterm from handling
        }
      }

      // Let xterm handle everything else (arrows, Ctrl+C, Ctrl+D, etc.)
      return true
    })
  }, [terminalRef])

  return <div ref={containerRef} className="terminal-container" />
}
