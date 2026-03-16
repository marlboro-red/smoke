import { bench, describe } from 'vitest'
import { TerminalOutputBuffer, stripAnsi, fastByteLength } from '../TerminalOutputBuffer'

// --- Benchmark data ---

const PLAIN_CHUNK = 'build output line with some typical content here\n'
const ANSI_CHUNK =
  '\x1b[32m✓\x1b[0m \x1b[1mtest passed\x1b[0m: some test name here with extra detail\n'
const MULTIBYTE_CHUNK = '你好世界🚀テスト完了 output line\n'

const LONG_ANSI_LINE =
  '\x1b[38;2;100;200;50m' +
  'INFO '.repeat(20) +
  '\x1b[0m' +
  '\x1b]0;window title\x07' +
  'payload data '.repeat(10) +
  '\n'

// --- Throughput benchmarks ---

describe('TerminalOutputBuffer throughput', () => {
  bench('append 10K plain-text chunks', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    for (let i = 0; i < 10_000; i++) {
      buf.append('s1', PLAIN_CHUNK)
    }
  })

  bench('append 10K ANSI-heavy chunks', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    for (let i = 0; i < 10_000; i++) {
      buf.append('s1', ANSI_CHUNK)
    }
  })

  bench('append 5K multibyte chunks', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    for (let i = 0; i < 5_000; i++) {
      buf.append('s1', MULTIBYTE_CHUNK)
    }
  })

  bench('append 1K long ANSI lines', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    for (let i = 0; i < 1_000; i++) {
      buf.append('s1', LONG_ANSI_LINE)
    }
  })

  bench('read after sustained append', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    for (let i = 0; i < 1_000; i++) buf.append('s1', PLAIN_CHUNK)
    return buf.read('s1')
  })

  bench('readLines(50) after sustained append', () => {
    const buf = new TerminalOutputBuffer(50 * 1024)
    for (let i = 0; i < 1_000; i++) buf.append('s1', PLAIN_CHUNK)
    return buf.readLines('s1', 50)
  })
})

describe('stripAnsi throughput', () => {
  const heavyAnsi = ANSI_CHUNK.repeat(100)

  bench('strip ANSI from 100-line block', () => {
    stripAnsi(heavyAnsi)
  })
})

describe('fastByteLength throughput', () => {
  const ascii = 'a'.repeat(4096)
  const mixed = ('hello€' + '你好').repeat(256)

  bench('fastByteLength 4KB ASCII', () => {
    fastByteLength(ascii)
  })

  bench('fastByteLength 4KB mixed multibyte', () => {
    fastByteLength(mixed)
  })
})
