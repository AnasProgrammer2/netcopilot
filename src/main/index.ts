import { app, shell, BrowserWindow, ipcMain, globalShortcut, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupStoreHandlers } from './store'
import { setupSshHandlers } from './ssh'
import { setupTelnetHandlers } from './telnet'
import { setupCredentialHandlers } from './credentials'
import { setupSerialHandlers } from './serial'
import { setupFileDialogHandlers } from './fileDialog'
import { setupLogHandlers } from './logger'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Zoom in/out/reset via Cmd+= / Cmd+- / Cmd+0
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (!mod) return
    const level = mainWindow!.webContents.getZoomLevel()
    if (input.key === '=' || input.key === '+') {
      mainWindow!.webContents.setZoomLevel(Math.min(level + 0.5, 5))
      event.preventDefault()
    } else if (input.key === '-') {
      mainWindow!.webContents.setZoomLevel(Math.max(level - 0.5, -5))
      event.preventDefault()
    } else if (input.key === '0') {
      mainWindow!.webContents.setZoomLevel(0)
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
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

  nativeTheme.themeSource = 'dark'

  setupStoreHandlers(ipcMain)
  setupSshHandlers(ipcMain, () => mainWindow)
  setupTelnetHandlers(ipcMain, () => mainWindow)
  setupCredentialHandlers(ipcMain)
  setupSerialHandlers(ipcMain, () => mainWindow)
  setupFileDialogHandlers(ipcMain, () => mainWindow)
  setupLogHandlers(ipcMain, () => mainWindow)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
