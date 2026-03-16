import { describe, it, expect, beforeEach } from 'vitest'
import { TerminalOutputBuffer, stripAnsi, fastByteLength } from '../TerminalOutputBuffer'

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
    // Fill with 80 ASCII bytes then 40 more
    buffer.append('s1', 'A'.repeat(80))
    buffer.append('s1', 'B'.repeat(40))
    const result = buffer.read('s1')
    expect(Buffer.byteLength(result, 'utf8')).toBe(100)
    // Should keep the tail: 60 A's + 40 B's
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

  it('reports buffer size in bytes', () => {
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

  describe('byte-accurate sizing', () => {
    it('tracks multibyte characters by actual UTF-8 bytes', () => {
      // '€' is 3 bytes in UTF-8, '😀' is 4 bytes
      buffer.append('s1', '€')
      expect(buffer.size('s1')).toBe(3)

      buffer.append('s1', '😀')
      expect(buffer.size('s1')).toBe(7) // 3 + 4
    })

    it('enforces byte limit correctly with multibyte content', () => {
      const smallBuf = new TerminalOutputBuffer(10)
      // 'aaaa' = 4 bytes, '€€€' = 9 bytes → total 13, over 10
      smallBuf.append('s1', 'aaaa')
      smallBuf.append('s1', '€€€')
      expect(smallBuf.size('s1')).toBeLessThanOrEqual(10)
    })

    it('handles single chunk exceeding maxBytes', () => {
      const smallBuf = new TerminalOutputBuffer(10)
      smallBuf.append('s1', 'A'.repeat(20))
      expect(smallBuf.size('s1')).toBe(10)
      expect(smallBuf.read('s1')).toBe('A'.repeat(10))
    })
  })

  describe('chunked storage', () => {
    it('does not rebuild entire string on each append', () => {
      // Append many small chunks — should not cause O(n²) copies
      for (let i = 0; i < 50; i++) {
        buffer.append('s1', 'x')
      }
      expect(buffer.read('s1')).toBe('x'.repeat(50))
      expect(buffer.size('s1')).toBe(50)
    })

    it('evicts oldest chunks when over capacity', () => {
      // Fill with 10 chunks of 15 bytes each = 150 total, limit is 100
      for (let i = 0; i < 10; i++) {
        buffer.append('s1', String(i).repeat(15))
      }
      const result = buffer.read('s1')
      expect(Buffer.byteLength(result, 'utf8')).toBe(100)
      // Should contain the last chunks, not the first
      expect(result).toContain('9'.repeat(15))
      expect(result.startsWith('0')).toBe(false)
    })
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

    it('returns lines spanning multiple chunks', () => {
      buffer.append('s1', 'line1\nline2\n')
      buffer.append('s1', 'line3\nline4\n')
      expect(buffer.readLines('s1', 3)).toBe('line3\nline4\n')
    })
  })
})

describe('fastByteLength', () => {
  it('returns string.length for ASCII-only strings', () => {
    expect(fastByteLength('hello world')).toBe(11)
    expect(fastByteLength('abcdef')).toBe(6)
    expect(fastByteLength('')).toBe(0)
  })

  it('returns correct byte length for multibyte strings', () => {
    // '€' is 3 bytes in UTF-8
    expect(fastByteLength('€')).toBe(3)
    // '😀' is 4 bytes in UTF-8
    expect(fastByteLength('😀')).toBe(4)
    // Mixed ASCII and multibyte
    expect(fastByteLength('hello€')).toBe(8) // 5 + 3
  })

  it('matches Buffer.byteLength for all inputs', () => {
    const cases = ['ascii', '€€€', '你好世界', 'mix€d', '😀🚀', 'a€b😀c']
    for (const s of cases) {
      expect(fastByteLength(s)).toBe(Buffer.byteLength(s, 'utf8'))
    }
  })
})

describe('TerminalOutputBuffer throughput', () => {
  it('handles high-throughput PTY output efficiently', () => {
    const buf = new TerminalOutputBuffer(50 * 1024) // 50KB default
    const chunk = 'build output line with some typical content here\n'
    const iterations = 10000

    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      buf.append('bench', chunk)
    }
    const elapsed = performance.now() - start

    // Verify correctness
    expect(buf.size('bench')).toBeLessThanOrEqual(50 * 1024)
    expect(buf.read('bench').length).toBeGreaterThan(0)

    // Should complete 10k appends well under 1 second
    expect(elapsed).toBeLessThan(1000)
  })

  it('handles high-throughput with ANSI-heavy output', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    const chunk = '\x1b[32m✓\x1b[0m \x1b[1mtest passed\x1b[0m: some test name here\n'
    const iterations = 10000

    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      buf.append('bench', chunk)
    }
    const elapsed = performance.now() - start

    expect(buf.size('bench')).toBeLessThanOrEqual(50 * 1024)
    expect(elapsed).toBeLessThan(1000)
  })

  it('handles multibyte-heavy throughput', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    // Simulate CJK/emoji-heavy output (3-4 bytes per char)
    const chunk = '你好世界🚀テスト完了\n'
    const iterations = 5000

    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      buf.append('bench', chunk)
    }
    const elapsed = performance.now() - start

    expect(buf.size('bench')).toBeLessThanOrEqual(50 * 1024)
    expect(elapsed).toBeLessThan(1000)
  })
})
