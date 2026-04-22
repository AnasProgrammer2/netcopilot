import { app, shell, BrowserWindow, ipcMain, globalShortcut, nativeTheme, nativeImage } from 'electron'
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
import { setupLicenseHandlers } from './license'

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
      sandbox: false,
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

  // Zoom in/out/reset via Cmd+= / Cmd+- / Cmd+0
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = process.platform === 'darwin' ? input.meta : input.control
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
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Block DevTools in production
  if (!process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools()
    })
    globalShortcut.register('CommandOrControl+Shift+I', () => {/* blocked */})
    globalShortcut.register('F12', () => {/* blocked */})
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

  nativeTheme.themeSource = 'dark'

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

  ipcMain.handle('app:check-update', async () => {
    try {
      // Step 1: get latest tag
      const tagsRes = await fetch(
        'https://api.github.com/repos/AnasProgrammer2/netcopilot/tags?per_page=1',
        { headers: { 'User-Agent': 'netcopilot-app' } }
      )
      if (!tagsRes.ok) throw new Error(`Tags API ${tagsRes.status}`)
      const tags = await tagsRes.json() as Array<{ name: string }>
      if (!tags.length) throw new Error('No tags found')

      const latestTag = tags[0].name
      const latest    = latestTag.replace(/^v/, '')
      const current   = app.getVersion()

      if (latest === current) {
        return { current, latest, hasUpdate: false, url: null }
      }

      // Step 2: fetch release assets for that tag to get the platform-specific download URL
      let downloadUrl = `https://github.com/AnasProgrammer2/netcopilot/releases/tag/${latestTag}`
      try {
        const releaseRes = await fetch(
          `https://api.github.com/repos/AnasProgrammer2/netcopilot/releases/tags/${latestTag}`,
          { headers: { 'User-Agent': 'netcopilot-app' } }
        )
        if (releaseRes.ok) {
          const release = await releaseRes.json() as { html_url: string; assets: Array<{ name: string; browser_download_url: string }> }
          const assets  = release.assets ?? []
          const plat    = process.platform   // darwin | win32 | linux
          const arch    = process.arch       // arm64 | x64

          let matched: { name: string; browser_download_url: string } | undefined

          if (plat === 'darwin') {
            // Prefer arch-matched .dmg, fall back to any .dmg
            matched = assets.find(a => a.name.endsWith('.dmg') && a.name.includes(arch))
                   ?? assets.find(a => a.name.endsWith('.dmg'))
          } else if (plat === 'win32') {
            // Prefer Setup .exe (not .blockmap)
            matched = assets.find(a => a.name.includes('Setup') && a.name.endsWith('.exe'))
                   ?? assets.find(a => a.name.endsWith('.exe') && !a.name.endsWith('.blockmap'))
          } else if (plat === 'linux') {
            matched = assets.find(a => a.name.endsWith('.AppImage'))
                   ?? assets.find(a => a.name.endsWith('.deb'))
          }

          if (matched) downloadUrl = matched.browser_download_url
          else downloadUrl = release.html_url  // fallback: release page
        }
      } catch {
        // If release assets fetch fails, keep fallback URL
      }

      return { current, latest, hasUpdate: true, url: downloadUrl }
    } catch (e) {
      return { current: app.getVersion(), latest: null, hasUpdate: false, error: String(e) }
    }
  })

  setupStoreHandlers(ipcMain)
  setupSshHandlers(ipcMain, () => mainWindow)
  setupTelnetHandlers(ipcMain, () => mainWindow)
  setupAiHandlers(ipcMain, () => mainWindow)
  setupLicenseHandlers(ipcMain)
  setupCredentialHandlers(ipcMain)
  setupSerialHandlers(ipcMain, () => mainWindow)
  setupFileDialogHandlers(ipcMain, () => mainWindow)
  setupLogHandlers(ipcMain, () => mainWindow)
  setupMasterPasswordHandlers(ipcMain)

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
