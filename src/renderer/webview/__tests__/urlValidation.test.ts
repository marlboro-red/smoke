import { describe, it, expect } from 'vitest'
import { isAllowedUrl, normalizeUrl } from '../urlValidation'

describe('isAllowedUrl', () => {
  it('allows http:// URLs', () => {
    expect(isAllowedUrl('http://example.com')).toBe(true)
    expect(isAllowedUrl('http://localhost:3000')).toBe(true)
    expect(isAllowedUrl('http://127.0.0.1:8080')).toBe(true)
  })

  it('allows https:// URLs', () => {
    expect(isAllowedUrl('https://example.com')).toBe(true)
    expect(isAllowedUrl('https://localhost:3000')).toBe(true)
    expect(isAllowedUrl('https://sub.domain.com/path?q=1')).toBe(true)
  })

  it('allows case-insensitive http/https', () => {
    expect(isAllowedUrl('HTTP://example.com')).toBe(true)
    expect(isAllowedUrl('HTTPS://example.com')).toBe(true)
    expect(isAllowedUrl('Http://example.com')).toBe(true)
  })

  it('rejects file:// URLs', () => {
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedUrl('file:///home/user/.ssh/id_rsa')).toBe(false)
    expect(isAllowedUrl('FILE:///etc/hosts')).toBe(false)
  })

  it('rejects javascript: URLs', () => {
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedUrl('JAVASCRIPT:void(0)')).toBe(false)
  })

  it('rejects data: URLs', () => {
    expect(isAllowedUrl('data:text/html,<h1>hi</h1>')).toBe(false)
  })

  it('rejects blob: URLs', () => {
    expect(isAllowedUrl('blob:http://example.com/uuid')).toBe(false)
  })

  it('rejects chrome:// and chrome-extension:// URLs', () => {
    expect(isAllowedUrl('chrome://settings')).toBe(false)
    expect(isAllowedUrl('chrome-extension://abc/popup.html')).toBe(false)
  })

  it('rejects devtools:// URLs', () => {
    expect(isAllowedUrl('devtools://devtools/bundled/inspector.html')).toBe(false)
  })

  it('rejects electron:// URLs', () => {
    expect(isAllowedUrl('electron://something')).toBe(false)
  })

  it('rejects URLs without a protocol', () => {
    expect(isAllowedUrl('example.com')).toBe(false)
    expect(isAllowedUrl('localhost:3000')).toBe(false)
  })

  it('rejects empty and whitespace strings', () => {
    expect(isAllowedUrl('')).toBe(false)
    expect(isAllowedUrl('   ')).toBe(false)
  })

  it('rejects http/https with no host', () => {
    expect(isAllowedUrl('http://')).toBe(false)
    expect(isAllowedUrl('https://')).toBe(false)
  })
})

describe('normalizeUrl', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeUrl('')).toBe('')
    expect(normalizeUrl('   ')).toBe('')
  })

  it('adds http:// prefix when no protocol is present', () => {
    expect(normalizeUrl('example.com')).toBe('http://example.com')
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeUrl('192.168.1.1:8080')).toBe('http://192.168.1.1:8080')
  })

  it('preserves existing http:// prefix', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('preserves existing https:// prefix', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
  })

  it('is case-insensitive for protocol detection', () => {
    expect(normalizeUrl('HTTP://example.com')).toBe('HTTP://example.com')
    expect(normalizeUrl('HTTPS://example.com')).toBe('HTTPS://example.com')
  })

  it('trims whitespace', () => {
    expect(normalizeUrl('  http://example.com  ')).toBe('http://example.com')
    expect(normalizeUrl('  example.com  ')).toBe('http://example.com')
  })
})
