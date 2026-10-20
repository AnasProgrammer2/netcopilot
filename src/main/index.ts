import { app, shell, BrowserWindow, ipcMain, nativeTheme, nativeImage, Menu, MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
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
import { setupHostKeyHandlers } from './hostKeys'
import { getSecurityWarnings } from './dbKey'
import { openExternalUrl } from './openExternalUrl'
import * as Sentry from '@sentry/electron/main'

// ── Sentry crash reporting (set SENTRY_DSN env var to enable) ──────────────
const SENTRY_DSN = process.env['SENTRY_DSN'] ?? ''
if (SENTRY_DSN) {
  Sentry.init({ dsn: SENTRY_DSN, environment: process.env['NODE_ENV'] ?? 'production' })
}

let mainWindow: BrowserWindow | null = null

const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

// Height of the unified title bar the renderer draws (tabs live in it).
const TITLEBAR_HEIGHT = 44

// Native caption buttons on Windows, tinted to match the sidebar. (Linux keeps
// the renderer-drawn buttons — window-controls overlay support varies by WM.)
const TITLEBAR_OVERLAY = {
  dark:  { color: '#0a0d14', symbolColor: '#b4bcc8' },
  light: { color: '#edf0f7', symbolColor: '#2a3347' },
}

const RENDERER_INDEX = join(__dirname, '../renderer/index.html')

/** Only the app's own page may be loaded in the main window. */
function isAppUrl(url: string): boolean {
  try {
    const target = new URL(url)
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) return target.origin === new URL(devUrl).origin
    return target.protocol === 'file:' && target.pathname === pathToFileURL(RENDERER_INDEX).pathname
  } catch {
    return false
  }
}

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
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 16, y: 15 } } : {}),
    ...(isWindows ? { titleBarOverlay: { ...TITLEBAR_OVERLAY.dark, height: TITLEBAR_HEIGHT } } : {}),
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
    app.dock?.setIcon(icon)
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Desktop apps don't pinch-zoom; keyboard zoom below stays available.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {})

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

  // Never navigate the app window away from the bundled UI (e.g. a link in
  // AI/markdown output, or injected content). http(s) links open in the
  // system browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openExternalUrl(url)
  })
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
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
    mainWindow.loadFile(RENDERER_INDEX)
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.netcopilot.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Follow the OS until the renderer applies the user's theme choice, so
  // "System" sees the real appearance and native controls match the app.
  nativeTheme.themeSource = 'system'
  buildAppMenu()

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

  // Keep native controls (menus, dropdowns, caption buttons) in step with the app theme.
  ipcMain.handle('window:set-appearance', (_, theme: unknown) => {
    const source = theme === 'dark' || theme === 'light' ? theme : 'system'
    nativeTheme.themeSource = source
    if (isWindows && mainWindow && !mainWindow.isDestroyed()) {
      const dark = source === 'system' ? nativeTheme.shouldUseDarkColors : source === 'dark'
      mainWindow.setTitleBarOverlay({ ...TITLEBAR_OVERLAY[dark ? 'dark' : 'light'], height: TITLEBAR_HEIGHT })
    }
  })

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
  setupHostKeyHandlers(ipcMain)
  ipcMain.handle('security:get-warnings', () => getSecurityWarnings())

  createWindow()
  setupAutoUpdater(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// ── Application menu ─────────────────────────────────────────────────────────
// macOS gets a real menu bar. App shortcuts (⌘K, ⌘W, ⌘B…) stay with the
// renderer, which owns the user's key bindings, so those items only display
// their accelerator instead of registering it. Windows/Linux use no menu bar —
// the default Electron one only exposes Reload and DevTools.
function buildAppMenu(): void {
  if (!isMac) {
    Menu.setApplicationMenu(null)
    return
  }
  const action = (name: string, accelerator?: string): MenuItemConstructorOptions => ({
    accelerator,
    registerAccelerator: false,
    click: () => mainWindow?.webContents.send('menu:action', name),
  })
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', ...action('settings', 'Cmd+,') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Connection…', ...action('new-connection') },
        { label: 'Quick Connect…', ...action('quick-connect', 'Cmd+K') },
        { label: 'New Tab', ...action('new-tab', 'Cmd+T') },
        { type: 'separator' },
        { label: 'Close Tab', ...action('close-tab', 'Cmd+W') },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', ...action('toggle-sidebar', 'Cmd+B') },
        { label: 'Toggle ARIA', ...action('toggle-ai', 'Cmd+Shift+A') },
        { label: 'Toggle Split View', ...action('toggle-split', 'Cmd+D') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'Getting Started', ...action('getting-started') },
        { label: 'Keyboard Shortcuts', ...action('shortcuts') },
        { type: 'separator' },
        { label: 'NetCopilot Website', click: () => openExternalUrl('https://netcopilot.app') },
        { label: 'Report an Issue', click: () => openExternalUrl('https://github.com/AnasProgrammer2/netcopilot/issues') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

