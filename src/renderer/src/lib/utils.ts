import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
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
