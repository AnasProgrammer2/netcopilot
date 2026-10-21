import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { on: vi.fn() }, ipcMain: { handle: vi.fn() }, shell: { openExternal: vi.fn() } }))
vi.mock('electron-updater', () => ({ autoUpdater: { on: vi.fn() } }))
vi.mock('electron-log', () => ({ default: {} }))
vi.mock('./store', () => ({ getSetting: () => undefined }))

import { canSelfUpdate } from './updater'

const realPlatform = process.platform
const realResources = (process as { resourcesPath?: string }).resourcesPath

function on(platform: NodeJS.Platform, env: Record<string, string | undefined> = {}, resourcesPath?: string): boolean {
  Object.defineProperty(process, 'platform', { value: platform })
  Object.defineProperty(process, 'resourcesPath', { value: resourcesPath ?? '/nonexistent', configurable: true })
  delete process.env['PORTABLE_EXECUTABLE_DIR']
  delete process.env['APPIMAGE']
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return canSelfUpdate()
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
  Object.defineProperty(process, 'resourcesPath', { value: realResources, configurable: true })
  delete process.env['PORTABLE_EXECUTABLE_DIR']
  delete process.env['APPIMAGE']
})

describe('canSelfUpdate', () => {
  it('updates the Windows installer build but not the portable exe', () => {
    expect(on('win32')).toBe(true)
    expect(on('win32', { PORTABLE_EXECUTABLE_DIR: 'C:\\Tools' })).toBe(false)
  })

  it('updates on macOS', () => {
    expect(on('darwin')).toBe(true)
  })

  it('updates a Linux AppImage or .deb install, nothing else', () => {
    expect(on('linux', { APPIMAGE: '/home/u/NetCopilot.AppImage' })).toBe(true)

    const deb = mkdtempSync(join(tmpdir(), 'nc-deb-'))
    writeFileSync(join(deb, 'package-type'), 'deb\n')
    expect(on('linux', {}, deb)).toBe(true)

    const rpm = mkdtempSync(join(tmpdir(), 'nc-rpm-'))
    writeFileSync(join(rpm, 'package-type'), 'rpm')
    expect(on('linux', {}, rpm)).toBe(false)

    expect(on('linux')).toBe(false)
  })
})
