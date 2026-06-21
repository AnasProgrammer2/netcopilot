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
 * Blacklist check — shared with main-process policy gate in `src/shared/aiPolicy.ts`.
 */
export { isBlacklisted as isCommandBlacklisted } from '../../../shared/aiPolicy'

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
