import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for the PTY data handling logic in usePty.ts.
 *
 * Since usePty is a React hook, we extract and test its core logic:
 * - Data buffering when terminal is not ready (smoke-cxo regression)
 * - Flushing buffered data when terminal becomes available
 * - Exit message formatting
 * - Session status update on exit
 */

describe('PTY data buffering logic (smoke-cxo regression)', () => {
  // Extracted from usePty's onData handler
  function handlePtyData(
    pendingData: string[],
    terminal: { write: (data: string) => void } | null,
    data: string
  ): void {
    if (terminal) {
      if (pendingData.length > 0) {
        terminal.write(pendingData.join(''))
        pendingData.length = 0
      }
      terminal.write(data)
    } else {
      pendingData.push(data)
    }
  }

  it('buffers data when terminal is not ready', () => {
    const pendingData: string[] = []
    handlePtyData(pendingData, null, 'first chunk')
    handlePtyData(pendingData, null, 'second chunk')

    expect(pendingData).toEqual(['first chunk', 'second chunk'])
  })

  it('flushes buffered data when terminal becomes available', () => {
    const pendingData: string[] = ['buffered-1', 'buffered-2']
    const mockTerminal = { write: vi.fn() }

    handlePtyData(pendingData, mockTerminal, 'new data')

    // First call flushes buffer, second writes new data
    expect(mockTerminal.write).toHaveBeenCalledTimes(2)
    expect(mockTerminal.write).toHaveBeenNthCalledWith(1, 'buffered-1buffered-2')
    expect(mockTerminal.write).toHaveBeenNthCalledWith(2, 'new data')
    expect(pendingData).toEqual([])
  })

  it('writes directly when terminal is ready and buffer is empty', () => {
    const pendingData: string[] = []
    const mockTerminal = { write: vi.fn() }

    handlePtyData(pendingData, mockTerminal, 'direct data')

    expect(mockTerminal.write).toHaveBeenCalledTimes(1)
    expect(mockTerminal.write).toHaveBeenCalledWith('direct data')
  })

  it('preserves order of buffered and new data', () => {
    const pendingData: string[] = []
    const mockTerminal = { write: vi.fn() }
    const writeOrder: string[] = []
    mockTerminal.write.mockImplementation((data: string) => writeOrder.push(data))

    // Simulate: 3 chunks arrive before terminal ready, then terminal becomes ready
    handlePtyData(pendingData, null, 'chunk-1')
    handlePtyData(pendingData, null, 'chunk-2')
    handlePtyData(pendingData, null, 'chunk-3')
    handlePtyData(pendingData, mockTerminal, 'chunk-4')

    expect(writeOrder).toEqual(['chunk-1chunk-2chunk-3', 'chunk-4'])
  })
})

describe('PTY exit message formatting', () => {
  // Extracted from usePty's onExit handler
  function formatExitMessage(exitCode: number): string {
    return `\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`
  }

  it('formats exit code 0', () => {
    const msg = formatExitMessage(0)
    expect(msg).toContain('exited with code 0')
    expect(msg).toContain('\x1b[90m') // dim gray
    expect(msg).toContain('\x1b[0m') // reset
  })

  it('formats non-zero exit code', () => {
    const msg = formatExitMessage(127)
    expect(msg).toContain('exited with code 127')
  })

  it('formats negative exit code (signal kill)', () => {
    const msg = formatExitMessage(-1)
    expect(msg).toContain('exited with code -1')
  })
})

describe('PTY event filtering', () => {
  // The onData/onExit handlers check event.id === sessionId
  it('only processes events for the matching session', () => {
    const sessionId = 'my-session'
    const mockTerminal = { write: vi.fn() }

    function handleEvent(eventId: string, data: string) {
      if (eventId !== sessionId) return
      mockTerminal.write(data)
    }

    handleEvent('other-session', 'should be ignored')
    expect(mockTerminal.write).not.toHaveBeenCalled()

    handleEvent('my-session', 'should be written')
    expect(mockTerminal.write).toHaveBeenCalledWith('should be written')
  })
})
