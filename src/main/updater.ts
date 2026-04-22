import { ipcMain, BrowserWindow, shell } from 'electron'
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, ...args: unknown[]) => {
    getWindow()?.webContents.send(channel, ...args)
  }

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send('updater:update-available', {
      version:    info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes ?? null,
    })
  })

  autoUpdater.on('update-not-available', () => {
    send('updater:update-not-available')
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    send('updater:download-progress', {
      percent:       Math.round(progress.percent),
      transferred:   progress.transferred,
      total:         progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    send('updater:update-downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    log.error('Auto-updater error:', err)
    send('updater:error', err.message)
  })

  // IPC: manual check triggered from renderer
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, updateInfo: result?.updateInfo ?? null }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // IPC: start download
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // IPC: quit and install
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // IPC: open release page in browser (fallback for unsigned builds)
  ipcMain.handle('updater:open-release', (_e, url: string) => {
    shell.openExternal(url)
  })

  // Auto-check on startup (production only, after 6s to not block launch)
  if (!process.env['ELECTRON_RENDERER_URL']) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.warn('Startup update check failed:', err)
      })
    }, 6000)
  }
}
