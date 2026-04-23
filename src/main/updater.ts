import { ipcMain, BrowserWindow, shell } from 'electron'
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

const isDev = !!process.env['ELECTRON_RENDERER_URL']

export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  // In dev mode, register no-op handlers — app-update.yml doesn't exist in dev
  if (isDev) {
    ipcMain.handle('updater:check',       async () => ({ success: false, error: 'Not available in dev mode' }))
    ipcMain.handle('updater:download',    async () => ({ success: false, error: 'Not available in dev mode' }))
    ipcMain.handle('updater:install',     () => {})
    ipcMain.handle('updater:open-release', (_e, url: string) => { shell.openExternal(url) })
    return
  }

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

  // IPC: start download
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // IPC: quit and install (falls back to website download page on failure)
  ipcMain.handle('updater:install', async () => {
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (err) {
      log.warn('quitAndInstall failed, opening download page:', err)
      shell.openExternal('https://netcopilot.app/#download')
    }
  })

  // IPC: open release page in browser (fallback for unsigned builds)
  ipcMain.handle('updater:open-release', (_e, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch { /* malformed URL — ignore */ }
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
