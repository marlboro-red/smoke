import { useRef, useEffect } from 'react'
import { useTerminal } from './useTerminal'
import { usePty } from './usePty'
import { useFocusedId } from '../stores/sessionStore'
import '@xterm/xterm/css/xterm.css'
import '../styles/terminal.css'

interface TerminalWidgetProps {
  sessionId: string
  cols?: number
  rows?: number
  onCharDims?: (dims: { width: number; height: number }) => void
  onSnapshot?: (getSnapshot: () => string[]) => void
}

export default function TerminalWidget({ sessionId, cols, rows, onCharDims, onSnapshot }: TerminalWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { terminalRef, getSnapshot, charDims } = useTerminal(containerRef, sessionId, cols, rows)
  usePty(sessionId, terminalRef)

  const focusedId = useFocusedId()

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

  // Focus/blur xterm.js based on focusedId
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    if (focusedId === sessionId) {
      terminal.focus()
    } else {
      terminal.blur()
    }
  }, [focusedId, sessionId, terminalRef])

  return <div ref={containerRef} className="terminal-container" />
}
