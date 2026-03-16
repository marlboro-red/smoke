import { describe, it, expect } from 'vitest'
import { isAllowedUrl, normalizeUrl } from '../urlValidation'

describe('isAllowedUrl', () => {
  it('allows http URLs', () => {
    expect(isAllowedUrl('http://example.com')).toBe(true)
    expect(isAllowedUrl('http://localhost:3000')).toBe(true)
  })

  it('allows https URLs', () => {
    expect(isAllowedUrl('https://example.com')).toBe(true)
    expect(isAllowedUrl('https://localhost:8443/path')).toBe(true)
  })

  it('is case-insensitive for protocol', () => {
    expect(isAllowedUrl('HTTP://example.com')).toBe(true)
    expect(isAllowedUrl('HTTPS://example.com')).toBe(true)
  })

  it('rejects file:// URLs', () => {
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedUrl('FILE:///home/user')).toBe(false)
  })

  it('rejects javascript: URLs', () => {
    expect(isAllowedUrl('javascript://alert(1)')).toBe(false)
  })

  it('rejects data: URLs', () => {
    expect(isAllowedUrl('data://text/html,<h1>hi</h1>')).toBe(false)
  })

  it('rejects blob: URLs', () => {
    expect(isAllowedUrl('blob://something')).toBe(false)
  })

  it('rejects chrome: URLs', () => {
    expect(isAllowedUrl('chrome://settings')).toBe(false)
  })

  it('rejects chrome-extension: URLs', () => {
    expect(isAllowedUrl('chrome-extension://abc/page.html')).toBe(false)
  })

  it('rejects devtools: URLs', () => {
    expect(isAllowedUrl('devtools://something')).toBe(false)
  })

  it('rejects electron: URLs', () => {
    expect(isAllowedUrl('electron://something')).toBe(false)
  })

  it('rejects URLs without a protocol', () => {
    expect(isAllowedUrl('example.com')).toBe(false)
    expect(isAllowedUrl('localhost:3000')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isAllowedUrl('')).toBe(false)
  })

  it('rejects http:// with no host', () => {
    expect(isAllowedUrl('http://')).toBe(false)
  })
})

describe('normalizeUrl', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeUrl('')).toBe('')
    expect(normalizeUrl('   ')).toBe('')
  })

  it('trims whitespace', () => {
    expect(normalizeUrl('  http://example.com  ')).toBe('http://example.com')
  })

  it('prepends http:// when no protocol', () => {
    expect(normalizeUrl('example.com')).toBe('http://example.com')
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000')
  })

  it('preserves http:// URLs as-is', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com')
  })

  it('preserves https:// URLs as-is', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
  })

  it('is case-insensitive for protocol detection', () => {
    expect(normalizeUrl('HTTP://example.com')).toBe('HTTP://example.com')
    expect(normalizeUrl('HTTPS://example.com')).toBe('HTTPS://example.com')
  })
})
