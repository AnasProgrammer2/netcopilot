import { app, shell, BrowserWindow, ipcMain, nativeTheme, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { setupStoreHandlers } from './store'
import { setupSshHandlers } from './ssh'
import { setupTelnetHandlers } from './telnet'
import { setupCredentialHandlers } from './credentials'
import { setupSerialHandlers } from './serial'
import { setupFileDialogHandlers } from './fileDialog'
import { setupLogHandlers } from './logger'
import { setupMasterPasswordHandlers } from './masterPassword'
import { setupAiHandlers } from './ai'
import { setupSftpHandlers } from './sftp'
import { setupLicenseHandlers } from './license'
import { setupAutoUpdater } from './updater'
import * as Sentry from '@sentry/electron/main'

// ── Sentry crash reporting (set SENTRY_DSN env var to enable) ──────────────
const SENTRY_DSN = process.env['SENTRY_DSN'] ?? ''
if (SENTRY_DSN) {
  Sentry.init({ dsn: SENTRY_DSN, environment: process.env['NODE_ENV'] ?? 'production' })
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f1117',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.platform === 'darwin' && !icon.isEmpty()) {
    app.dock.setIcon(icon)
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-change', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-change', false)
  })

  // Zoom in/out/reset via Cmd+= / Cmd+- / Cmd+0
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = process.platform === 'darwin' ? input.meta : input.control

    // Block DevTools shortcuts in-window only (not OS-globally)
    if (!process.env['ELECTRON_RENDERER_URL']) {
      if (input.key === 'F12' || (mod && input.shift && input.key === 'I')) {
        event.preventDefault()
        return
      }
    }

    if (!mod) return
    if (!mainWindow) return
    const level = mainWindow.webContents.getZoomLevel()
    if (input.key === '=' || input.key === '+') {
      mainWindow.webContents.setZoomLevel(Math.min(level + 0.5, 5))
      event.preventDefault()
    } else if (input.key === '-') {
      mainWindow.webContents.setZoomLevel(Math.max(level - 0.5, -5))
      event.preventDefault()
    } else if (input.key === '0') {
      mainWindow.webContents.setZoomLevel(0)
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
        shell.openExternal(details.url)
      }
    } catch { /* malformed URL — ignore */ }
    return { action: 'deny' }
  })

  // Block DevTools in production (close if opened via other means)
  if (!process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools()
    })
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.netcopilot.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  nativeTheme.themeSource = 'light'

  // macOS "About" panel — show app icon + correct version
  if (process.platform === 'darwin') {
    const aboutIcon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
    app.setAboutPanelOptions({
      applicationName: 'NetCopilot',
      applicationVersion: app.getVersion(),
      version: '',
      iconPath: join(__dirname, '../../resources/icon.png'),
      ...(aboutIcon.isEmpty() ? {} : { icon: aboutIcon }),
    })
  }

  ipcMain.handle('app:get-version', () => app.getVersion())

  // Window controls for custom titlebar (Windows/Linux)
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  setupStoreHandlers(ipcMain)
  setupSshHandlers(ipcMain, () => mainWindow)
  setupSftpHandlers(ipcMain, () => mainWindow)
  setupTelnetHandlers(ipcMain, () => mainWindow)
  setupAiHandlers(ipcMain, () => mainWindow)
  setupLicenseHandlers(ipcMain)
  setupCredentialHandlers(ipcMain)
  setupSerialHandlers(ipcMain, () => mainWindow)
  setupFileDialogHandlers(ipcMain, () => mainWindow)
  setupLogHandlers(ipcMain, () => mainWindow)
  setupMasterPasswordHandlers(ipcMain)

  createWindow()
  setupAutoUpdater(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

