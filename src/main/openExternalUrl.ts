import { shell } from 'electron'

/** Open http/https URLs only — blocks javascript:, file:, etc. */
export function openExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      shell.openExternal(url)
      return true
    }
  } catch { /* malformed URL */ }
  return false
}
