const BLOCKED_PROTOCOLS = /^(file|javascript|data|blob|chrome|chrome-extension|devtools|electron):\/\//i

export function isAllowedUrl(url: string): boolean {
  if (BLOCKED_PROTOCOLS.test(url)) return false
  return /^https?:\/\/.+/i.test(url)
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
