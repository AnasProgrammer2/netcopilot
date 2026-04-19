import { IpcMain, dialog, BrowserWindow, app } from 'electron'
import path from 'path'
import { readFile, writeFile } from 'fs/promises'

export function setupFileDialogHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle('dialog:export', async (_, content: string, filename = 'netcopilot-connections.json') => {
    const win = getWindow() ?? undefined
    try {
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export Connections',
        defaultPath: filename,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (result.canceled || !result.filePath) return { success: false }
      await writeFile(result.filePath, content, 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('dialog:import', async () => {
    const win = getWindow() ?? undefined
    try {
      const result = await dialog.showOpenDialog(win!, {
        title: 'Import Connections',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return await readFile(result.filePaths[0], 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('dialog:selectFolder', async () => {
    const win = getWindow() ?? undefined
    try {
      const result = await dialog.showOpenDialog(win!, {
        title: 'Select Log Folder',
        defaultPath: app.getPath('documents'),
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    } catch {
      return null
    }
  })

  ipcMain.handle('dialog:getDefaultLogDir', () => {
    return path.join(app.getPath('documents'), 'NetCopilot Logs')
  })
}
