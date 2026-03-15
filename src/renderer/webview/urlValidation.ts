const ALLOWED_LOCALHOST_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?(\/.*)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/,
  /^https?:\/\/\[::1\](:\d+)?(\/.*)?$/,
  /^https?:\/\/0\.0\.0\.0(:\d+)?(\/.*)?$/,
]

export function isAllowedUrl(url: string): boolean {
  return ALLOWED_LOCALHOST_PATTERNS.some((pattern) => pattern.test(url))
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  // Add http:// if no protocol specified
  if (!/^https?:\/\//i.test(trimmed)) {
    return `http://${trimmed}`
  }
  return trimmed
}
