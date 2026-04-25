import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
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
