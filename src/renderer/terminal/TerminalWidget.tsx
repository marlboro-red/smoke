import { useRef, useEffect } from 'react'
import { useTerminal } from './useTerminal'
import { usePty } from './usePty'
import '@xterm/xterm/css/xterm.css'
import '../styles/terminal.css'

interface TerminalWidgetProps {
  sessionId: string
  cols?: number
  rows?: number
  onCharDims?: (dims: { width: number; height: number }) => void
}

export default function TerminalWidget({ sessionId, cols, rows, onCharDims }: TerminalWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { terminalRef, getSnapshot, charDims } = useTerminal(containerRef, cols, rows)
  usePty(sessionId, terminalRef)

  // Expose getSnapshot for parent access if needed
  void getSnapshot

  // Report charDims to parent when measured
  useEffect(() => {
    if (onCharDims && charDims.current.width > 0) {
      onCharDims(charDims.current)
    }
  }, [onCharDims, charDims])

  return <div ref={containerRef} className="terminal-container" />
}
