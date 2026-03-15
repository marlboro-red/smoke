import { describe, it, expect, beforeEach } from 'vitest'
import { TerminalOutputBuffer, stripAnsi } from '../TerminalOutputBuffer'

describe('stripAnsi', () => {
  it('removes CSI sequences (colors, cursor movement)', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
    expect(stripAnsi('\x1b[1;32mbold green\x1b[0m')).toBe('bold green')
  })

  it('removes OSC sequences (title setting)', () => {
    expect(stripAnsi('\x1b]0;my title\x07some text')).toBe('some text')
    expect(stripAnsi('\x1b]0;title\x1b\\text')).toBe('text')
  })

  it('removes carriage returns', () => {
    expect(stripAnsi('line1\r\nline2')).toBe('line1\nline2')
  })

  it('removes cursor movement sequences', () => {
    expect(stripAnsi('\x1b[2Jhello\x1b[H')).toBe('hello')
  })

  it('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world')
  })
})

describe('TerminalOutputBuffer', () => {
  let buffer: TerminalOutputBuffer

  beforeEach(() => {
    buffer = new TerminalOutputBuffer(100) // 100 bytes for easy testing
  })

  it('stores and reads output for a session', () => {
    buffer.append('s1', 'hello ')
    buffer.append('s1', 'world')
    expect(buffer.read('s1')).toBe('hello world')
  })

  it('returns empty string for unknown session', () => {
    expect(buffer.read('nonexistent')).toBe('')
  })

  it('strips ANSI codes before storing', () => {
    buffer.append('s1', '\x1b[32mgreen\x1b[0m text')
    expect(buffer.read('s1')).toBe('green text')
  })

  it('trims from the front when over capacity', () => {
    // Fill with 100 chars
    buffer.append('s1', 'A'.repeat(80))
    buffer.append('s1', 'B'.repeat(40))
    const result = buffer.read('s1')
    expect(result.length).toBe(100)
    // Should keep the tail: 20 A's + 40 B's
    expect(result).toBe('A'.repeat(60) + 'B'.repeat(40))
  })

  it('isolates sessions from each other', () => {
    buffer.append('s1', 'first')
    buffer.append('s2', 'second')
    expect(buffer.read('s1')).toBe('first')
    expect(buffer.read('s2')).toBe('second')
  })

  it('deletes a session buffer', () => {
    buffer.append('s1', 'data')
    buffer.delete('s1')
    expect(buffer.read('s1')).toBe('')
  })

  it('lists active sessions', () => {
    buffer.append('s1', 'a')
    buffer.append('s2', 'b')
    expect(buffer.sessions().sort()).toEqual(['s1', 's2'])
  })

  it('reports buffer size', () => {
    buffer.append('s1', 'hello')
    expect(buffer.size('s1')).toBe(5)
    expect(buffer.size('unknown')).toBe(0)
  })

  it('clears all buffers', () => {
    buffer.append('s1', 'a')
    buffer.append('s2', 'b')
    buffer.clear()
    expect(buffer.sessions()).toEqual([])
  })

  it('ignores data that is purely ANSI codes', () => {
    buffer.append('s1', '\x1b[31m\x1b[0m')
    expect(buffer.read('s1')).toBe('')
    // Buffer should not even have an entry
    expect(buffer.sessions()).toEqual([])
  })

  describe('readLines', () => {
    it('returns last N lines', () => {
      buffer.append('s1', 'line1\nline2\nline3\nline4\n')
      expect(buffer.readLines('s1', 2)).toBe('line4\n')
    })

    it('returns all content if fewer lines than requested', () => {
      buffer.append('s1', 'only\n')
      expect(buffer.readLines('s1', 10)).toBe('only\n')
    })

    it('returns empty for unknown session', () => {
      expect(buffer.readLines('x', 5)).toBe('')
    })
  })
})
