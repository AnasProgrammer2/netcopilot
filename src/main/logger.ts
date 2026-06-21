import { IpcMain, dialog, BrowserWindow, app } from 'electron'
import { createWriteStream, WriteStream, mkdirSync, statSync, renameSync, existsSync, readdirSync, unlinkSync } from 'fs'
import path from 'path'

const openLogs = new Map<string, WriteStream>()
const logMetadata = new Map<string, {
  basePath: string
  sessionName: string
  currentFile: string
  currentSize: number
  rotationEnabled: boolean
  rotationSizeBytes: number
  maxFiles: number
}>()

function showSaveDialog(win: BrowserWindow | null | undefined, opts: Electron.SaveDialogOptions) {
  return win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts)
}

// ── Log Rotation Helpers ────────────────────────────────────────────────────

interface RotationConfig {
  enabled: boolean
  sizeMB: number
  maxFiles: number
}

function getRotationConfig(): RotationConfig {
  // Default values - will be overridden by settings if available
  return {
    enabled: false,
    sizeMB: 10,
    maxFiles: 10
  }
}

function rotateLogFile(basePath: string, maxFiles: number): void {
  const ext = path.extname(basePath)
  const baseName = basePath.slice(0, -ext.length) || basePath

  // Delete oldest file if it exists
  const oldestFile = `${baseName}${ext}.${maxFiles}`
  if (existsSync(oldestFile)) {
    try { unlinkSync(oldestFile) } catch { /* ignore */ }
  }

  // Shift existing files (9→10, 8→9, ..., 1→2)
  for (let i = maxFiles - 1; i >= 1; i--) {
    const oldFile = `${baseName}${ext}.${i}`
    const newFile = `${baseName}${ext}.${i + 1}`
    if (existsSync(oldFile)) {
      try { renameSync(oldFile, newFile) } catch { /* ignore */ }
    }
  }

  // Rename current file to .1
  if (existsSync(basePath)) {
    try { renameSync(basePath, `${baseName}${ext}.1`) } catch { /* ignore */ }
  }
}

function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

function cleanupOldLogs(logDir: string, baseName: string, maxFiles: number): void {
  try {
    const files = readdirSync(logDir)
    const logFiles = files
      .filter(f => f.startsWith(baseName) && f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(logDir, f),
        time: statSync(path.join(logDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time) // newest first

    // Keep only maxFiles newest files
    if (logFiles.length > maxFiles) {
      logFiles.slice(maxFiles).forEach(f => {
        try { unlinkSync(f.path) } catch { /* ignore */ }
      })
    }
  } catch { /* ignore cleanup errors */ }
}

export function setupLogHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null): void {
  // Store rotation config from settings
  let rotationConfig = getRotationConfig()

  // Update rotation config when settings change
  ipcMain.handle('log:set-rotation-config', (_, config: RotationConfig) => {
    rotationConfig = config
    return true
  })

  ipcMain.handle('log:start', async (_, sessionName: string, config?: RotationConfig) => {
    const win = getWindow()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultName = `${sessionName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${timestamp}.log`

    const result = await showSaveDialog(win, {
      title: 'Save Session Log',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [
        { name: 'Log Files', extensions: ['log'] },
        { name: 'Text Files', extensions: ['txt'] }
      ]
    })

    if (result.canceled || !result.filePath) return null

    const filePath = result.filePath
    const existing = openLogs.get(filePath)
    if (existing) { existing.end(); openLogs.delete(filePath) }

    // Setup rotation metadata
    const useConfig = config || rotationConfig
    logMetadata.set(filePath, {
      basePath: filePath,
      sessionName,
      currentFile: filePath,
      currentSize: getFileSize(filePath),
      rotationEnabled: useConfig.enabled,
      rotationSizeBytes: useConfig.sizeMB * 1024 * 1024,
      maxFiles: useConfig.maxFiles
    })

    const stream = createWriteStream(filePath, { flags: 'a', encoding: 'utf8' })
    openLogs.set(filePath, stream)
    stream.write(`=== NetCopilot Log — ${sessionName} — ${new Date().toISOString()} ===\n`)
    return filePath
  })

  // Start logging to a specific path directly (no dialog) — used for auto-log
  ipcMain.handle('log:startAt', (_, filePath: string, sessionName: string, config?: RotationConfig) => {
    try {
      const resolved = path.resolve(filePath)
      const allowedBase = app.getPath('documents')
      if (!resolved.startsWith(allowedBase)) {
        console.error('[logger] startAt blocked — path outside documents:', resolved)
        return null
      }
      mkdirSync(path.dirname(resolved), { recursive: true })
      const existing = openLogs.get(resolved)
      if (existing) { existing.end(); openLogs.delete(resolved) }

      // Setup rotation metadata
      const useConfig = config || rotationConfig
      logMetadata.set(resolved, {
        basePath: resolved,
        sessionName,
        currentFile: resolved,
        currentSize: getFileSize(resolved),
        rotationEnabled: useConfig.enabled,
        rotationSizeBytes: useConfig.sizeMB * 1024 * 1024,
        maxFiles: useConfig.maxFiles
      })

      const stream = createWriteStream(resolved, { flags: 'a', encoding: 'utf8' })
      openLogs.set(resolved, stream)
      stream.write(`=== NetCopilot Log — ${sessionName} — ${new Date().toISOString()} ===\n`)
      return resolved
    } catch (e) {
      console.error('[logger] startAt failed:', e)
      return null
    }
  })

  ipcMain.handle('log:append', (_, filePath: string, data: string) => {
    const stream = openLogs.get(filePath)
    if (!stream) return false

    const meta = logMetadata.get(filePath)
    if (meta && meta.rotationEnabled) {
      // Check if we need to rotate
      const dataSize = Buffer.byteLength(data, 'utf8')
      if (meta.currentSize + dataSize > meta.rotationSizeBytes) {
        // Close current stream
        stream.end()
        openLogs.delete(filePath)

        // Rotate file
        rotateLogFile(meta.basePath, meta.maxFiles)

        // Clean up old archived files in auto-log directory
        const dir = path.dirname(meta.basePath)
        const baseName = path.basename(meta.basePath, '.log')
        cleanupOldLogs(dir, baseName, meta.maxFiles)

        // Create new stream
        const newStream = createWriteStream(meta.basePath, { flags: 'a', encoding: 'utf8' })
        openLogs.set(filePath, newStream)
        newStream.write(`=== NetCopilot Log — ${meta.sessionName} — ${new Date().toISOString()} (continued) ===\n`)

        // Update metadata
        meta.currentSize = 0
        meta.currentFile = meta.basePath

        // Write the data
        newStream.write(data)
        meta.currentSize += dataSize
        return true
      }

      // Update current size
      meta.currentSize += dataSize
    }

    stream.write(data)
    return true
  })

  ipcMain.handle('log:stop', (_, filePath: string) => {
    const stream = openLogs.get(filePath)
    if (stream) {
      stream.write(`\n=== Log stopped: ${new Date().toISOString()} ===\n`)
      stream.end()
      openLogs.delete(filePath)
    }
    // Clean up metadata
    logMetadata.delete(filePath)
    return true
  })
}
