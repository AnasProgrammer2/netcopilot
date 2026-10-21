import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import log from 'electron-log'
import { openExternalUrl } from './openExternalUrl'
import { getSetting } from './store'

// In-app updates. electron-updater downloads the new build from the GitHub
// release (latest*.yml + blockmaps) and installs it on restart or on quit.
// Builds that can't replace themselves (Windows portable, Linux outside an
// AppImage or .deb) fall back to opening the installer download.

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

const isDev = !!process.env['ELECTRON_RENDERER_URL']
const RECHECK_MS = 4 * 60 * 60 * 1000

/** Whether this build can download and install an update by itself. */
export function canSelfUpdate(): boolean {
  if (process.platform === 'win32') return !process.env['PORTABLE_EXECUTABLE_DIR']
  if (process.platform === 'darwin') return true
  if (process.platform === 'linux') {
    if (process.env['APPIMAGE']) return true
    try {
      const typeFile = join(process.resourcesPath, 'package-type')
      return existsSync(typeFile) && readFileSync(typeFile, 'utf8').trim() === 'deb'
    } catch { return false }
  }
  return false
}

/** User preference; the database may still be locked at startup, so default on. */
function autoDownloadEnabled(): boolean {
  try { return getSetting<boolean>('autoDownloadUpdates') !== false } catch { return true }
}

export function setupAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (isDev) {
    ipcMain.handle('updater:check', async () => ({ success: false, error: 'Not available in dev mode' }))
    ipcMain.handle('updater:download', async () => ({ success: false, error: 'Not available in dev mode' }))
    ipcMain.handle('updater:install', async () => ({ success: false, error: 'Not available in dev mode' }))
    ipcMain.handle('updater:open-release', (_e, url: string) => { openExternalUrl(url) })
    return
  }

  const selfUpdate = canSelfUpdate()
  let downloading = false
  let downloadedVersion: string | null = null

  const send = (channel: string, ...args: unknown[]) => {
    getWindow()?.webContents.send(channel, ...args)
  }

  const startDownload = async (): Promise<{ success: boolean; error?: string }> => {
    if (!selfUpdate) return { success: false, error: 'This build cannot update itself' }
    if (downloadedVersion) return { success: true }
    if (downloading) return { success: true }
    downloading = true
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      log.error('Update download failed:', err)
      return { success: false, error: String(err) }
    } finally {
      downloading = false
    }
  }

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send('updater:update-available', {
      version:      info.version,
      releaseDate:  info.releaseDate,
      releaseNotes: info.releaseNotes ?? null,
      canInstall:   selfUpdate,
    })
    if (selfUpdate && autoDownloadEnabled()) void startDownload()
  })

  autoUpdater.on('update-not-available', () => {
    send('updater:update-not-available')
  })

  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    send('updater:download-progress', {
      percent:        p.percent,
      transferred:    p.transferred,
      total:          p.total,
      bytesPerSecond: p.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    downloadedVersion = info.version
    send('updater:update-downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    log.error('Auto-updater error:', err)
    send('updater:error', err.message)
  })

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.updateInfo) return { success: true, updateAvailable: false, canInstall: selfUpdate }

      const current = autoUpdater.currentVersion.format()
      const remote  = result.updateInfo.version
      const hasUpdate = remote !== current

      return {
        success: true,
        updateAvailable: hasUpdate,
        updateInfo: hasUpdate ? result.updateInfo : null,
        canInstall: selfUpdate,
        downloaded: hasUpdate && downloadedVersion === remote,
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('updater:download', () => startDownload())

  ipcMain.handle('updater:install', () => {
    if (!downloadedVersion) return { success: false, error: 'No update has been downloaded' }
    // Let the IPC reply go out before the app starts quitting.
    setImmediate(() => {
      try {
        // Silent install on Windows (same folder as before), then relaunch.
        autoUpdater.quitAndInstall(true, true)
      } catch (err) {
        log.error('quitAndInstall failed:', err)
        send('updater:error', String(err))
      }
    })
    return { success: true }
  })

  ipcMain.handle('updater:open-release', (_e, url: string) => {
    openExternalUrl(url)
  })

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('Update check failed:', err)
    })
  }

  // First check shortly after startup, then every few hours: sessions often
  // stay open for days.
  setTimeout(check, 6000)
  const timer = setInterval(() => { if (!downloadedVersion) check() }, RECHECK_MS)
  app.on('before-quit', () => clearInterval(timer))
}
