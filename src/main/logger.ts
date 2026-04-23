import { IpcMain, dialog, BrowserWindow, app } from 'electron'
import { createWriteStream, WriteStream, mkdirSync } from 'fs'
import path from 'path'

const openLogs = new Map<string, WriteStream>()

export function setupLogHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('log:start', async (_, sessionName: string) => {
    const win = getWindow()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultName = `${sessionName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${timestamp}.log`

    const result = await dialog.showSaveDialog(win!, {
      title: 'Save Session Log',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [
        { name: 'Log Files', extensions: ['log'] },
        { name: 'Text Files', extensions: ['txt'] }
      ]
    })

    if (result.canceled || !result.filePath) return null

    const existing = openLogs.get(result.filePath)
    if (existing) { existing.end(); openLogs.delete(result.filePath) }
    const stream = createWriteStream(result.filePath, { flags: 'a', encoding: 'utf8' })
    openLogs.set(result.filePath, stream)
    stream.write(`=== NetCopilot Log — ${sessionName} — ${new Date().toISOString()} ===\n`)
    return result.filePath
  })

  // Start logging to a specific path directly (no dialog) — used for auto-log
  ipcMain.handle('log:startAt', (_, filePath: string, sessionName: string) => {
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
    if (stream) stream.write(data)
    return true
  })

  ipcMain.handle('log:stop', (_, filePath: string) => {
    const stream = openLogs.get(filePath)
    if (stream) {
      stream.write(`\n=== Log stopped: ${new Date().toISOString()} ===\n`)
      stream.end()
      openLogs.delete(filePath)
    }
    return true
  })
}
