import { IpcMain, safeStorage } from 'electron'
import { getDb } from './db'
import { isUnlocked } from './masterPassword'

function credKey(key: string): string {
  return `cred:${key}`
}

export function saveCredential(key: string, value: string): { success: boolean; error?: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    return { success: false, error: 'OS encryption unavailable — cannot store credentials securely.' }
  }
  try {
    const encrypted = safeStorage.encryptString(value)
    const encoded = encrypted.toString('base64')
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run({ key: credKey(key), value: JSON.stringify(encoded) })
    return { success: true }
  } catch (err) {
    return { success: false, error: `Encryption failed: ${String(err)}` }
  }
}

export function loadCredential(key: string): string | null {
  try {
    const row = getDb()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(credKey(key)) as { value: string } | undefined
    if (!row) return null
    const encoded: string = JSON.parse(row.value)
    const buf = Buffer.from(encoded, 'base64')
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(buf)
      } catch {
        return buf.toString('utf-8')
      }
    }
    return buf.toString('utf-8')
  } catch {
    return null
  }
}

export function deleteCredential(key: string): boolean {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(credKey(key))
  return true
}

// AI provider keys (ai.*) are managed only through the ai:* handlers, which
// never hand the raw key back to the renderer.
function isRendererKey(key: unknown): key is string {
  return typeof key === 'string' && !key.startsWith('ai.')
}

export function setupCredentialHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('credentials:save', (_, key: string, value: string) => {
    if (!isRendererKey(key)) return { success: false, error: 'Reserved credential key.' }
    return saveCredential(key, value)
  })

  ipcMain.handle('credentials:get', (_, key: string) => {
    // Master password set but not entered yet (or idle-locked): keep secrets sealed.
    if (!isUnlocked() || !isRendererKey(key)) return null
    return loadCredential(key)
  })

  ipcMain.handle('credentials:delete', (_, key: string) => {
    if (!isRendererKey(key)) return false
    return deleteCredential(key)
  })
}
