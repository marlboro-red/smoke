import { useRef } from 'react'
import { useTerminal } from './useTerminal'
import { usePty } from './usePty'
import '@xterm/xterm/css/xterm.css'
import '../styles/terminal.css'

interface TerminalWidgetProps {
  sessionId: string
  cols?: number
  rows?: number
}

export default function TerminalWidget({ sessionId, cols, rows }: TerminalWidgetProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { terminalRef, getSnapshot, charDims } = useTerminal(containerRef, cols, rows)
  usePty(sessionId, terminalRef)

  // Expose getSnapshot and charDims on the component for parent access if needed
  void getSnapshot
  void charDims

  return <div ref={containerRef} className="terminal-container" />
}
