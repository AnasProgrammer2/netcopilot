import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g
// eslint-disable-next-line no-control-regex
const ANSI_CHARSET_RE = /\x1b[()][AB012]/g
// eslint-disable-next-line no-control-regex
const ANSI_OSC_RE = /\x1b\][^\x07]*\x07/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '').replace(ANSI_CHARSET_RE, '').replace(ANSI_OSC_RE, '')
}

/**
 * Robust blacklist check that mirrors the main-process gate in `src/main/ai.ts`.
 * - Single-token patterns use word boundaries → "route" no longer triggers on "router"
 * - Multi-word or path-like patterns fall back to substring match
 * - All comparisons are case-insensitive
 */
export function isCommandBlacklisted(command: string, patterns: string[]): boolean {
  const normalised = command.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const raw of patterns) {
    const p = raw.trim().toLowerCase()
    if (!p) continue
    if (p.includes(' ') || p.includes('/')) {
      if (normalised.includes(p)) return true
    } else {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(^|[^a-z0-9_-])${escaped}([^a-z0-9_-]|$)`, 'i')
      if (re.test(normalised)) return true
    }
  }
  return false
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  return `${mo}mo ago`
}

const RELEASE_BASE = 'https://github.com/AnasProgrammer2/netcopilot/releases/download'

export function getInstallerUrl(version: string): string {
  const { platform, arch } = window.api.appInfo
  const tag = `v${version}`

  if (platform === 'win32')  return `${RELEASE_BASE}/${tag}/NetCopilot-Setup-${version}.exe`
  if (platform === 'darwin') return arch === 'arm64'
    ? `${RELEASE_BASE}/${tag}/NetCopilot-${version}-arm64.dmg`
    : `${RELEASE_BASE}/${tag}/NetCopilot-${version}.dmg`
  return `${RELEASE_BASE}/${tag}/NetCopilot-${version}.AppImage`
}
