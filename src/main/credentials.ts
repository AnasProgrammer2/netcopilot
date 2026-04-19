import { IpcMain, safeStorage } from 'electron'
import { getDb } from './db'

function credKey(key: string): string {
  return `cred:${key}`
}

export function setupCredentialHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('credentials:save', (_, key: string, value: string) => {
    try {
      const encrypted = safeStorage.encryptString(value)
      const encoded = encrypted.toString('base64')
      getDb()
        .prepare("INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run({ key: credKey(key), value: JSON.stringify(encoded) })
      return { success: true }
    } catch {
      const encoded = Buffer.from(value).toString('base64')
      getDb()
        .prepare("INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run({ key: credKey(key), value: JSON.stringify(encoded) })
      return { success: true }
    }
  })

  ipcMain.handle('credentials:get', (_, key: string) => {
    try {
      const row = getDb()
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get(credKey(key)) as { value: string } | undefined
      if (!row) return null
      const encoded: string = JSON.parse(row.value)
      const buf = Buffer.from(encoded, 'base64')
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buf)
      }
      return buf.toString()
    } catch {
      return null
    }
  })

  ipcMain.handle('credentials:delete', (_, key: string) => {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(credKey(key))
    return true
  })
}
