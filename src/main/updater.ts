import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import log from 'electron-log'
import { openExternalUrl } from './openExternalUrl'

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

const isDev = !!process.env['ELECTRON_RENDERER_URL']

export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (isDev) {
    ipcMain.handle('updater:check', async () => ({ success: false, error: 'Not available in dev mode' }))
    ipcMain.handle('updater:open-release', (_e, url: string) => { openExternalUrl(url) })
    return
  }

  const send = (channel: string, ...args: unknown[]) => {
    getWindow()?.webContents.send(channel, ...args)
  }

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send('updater:update-available', {
      version:     info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes ?? null,
    })
  })

  autoUpdater.on('update-not-available', () => {
    send('updater:update-not-available')
  })

  autoUpdater.on('error', (err: Error) => {
    log.error('Auto-updater error:', err)
    send('updater:error', err.message)
  })

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.updateInfo) return { success: true, updateAvailable: false }

      const current = autoUpdater.currentVersion.format()
      const remote  = result.updateInfo.version
      const hasUpdate = remote !== current

      return {
        success: true,
        updateAvailable: hasUpdate,
        updateInfo: hasUpdate ? result.updateInfo : null,
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('updater:open-release', (_e, url: string) => {
    openExternalUrl(url)
  })

  // Auto-check on startup (production only, after 6s)
  if (!process.env['ELECTRON_RENDERER_URL']) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.warn('Startup update check failed:', err)
      })
    }, 6000)
  }
}
