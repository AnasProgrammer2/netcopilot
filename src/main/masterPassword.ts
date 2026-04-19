import { IpcMain, safeStorage } from 'electron'
import { createHash, timingSafeEqual } from 'crypto'
import { getDb } from './db'

const SETTING_KEY = 'masterPasswordHash'

function hashPassword(password: string): string {
  return createHash('sha256').update(`netcopilot:${password}`).digest('hex')
}

function saveHash(hash: string): void {
  const db = getDb()
  const encoded = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(hash).toString('base64')
    : Buffer.from(hash).toString('base64')
  db.prepare("INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run({ key: SETTING_KEY, value: JSON.stringify(encoded) })
}

function loadHash(): string | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTING_KEY) as { value: string } | undefined
  if (!row) return null
  try {
    const encoded: string = JSON.parse(row.value)
    const buf = Buffer.from(encoded, 'base64')
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf-8')
  } catch {
    return null
  }
}

export function setupMasterPasswordHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('auth:hasMasterPassword', () => {
    return loadHash() !== null
  })

  ipcMain.handle('auth:setMasterPassword', (_, password: string) => {
    if (!password || password.length < 4) return { success: false, error: 'Password must be at least 4 characters' }
    saveHash(hashPassword(password))
    return { success: true }
  })

  ipcMain.handle('auth:verifyMasterPassword', (_, password: string) => {
    const stored = loadHash()
    if (!stored) return true // No password set — always pass
    const attempt = hashPassword(password)
    try {
      return timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(attempt, 'hex'))
    } catch {
      return false
    }
  })

  ipcMain.handle('auth:clearMasterPassword', (_, currentPassword: string) => {
    const stored = loadHash()
    if (stored) {
      const attempt = hashPassword(currentPassword)
      try {
        if (!timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(attempt, 'hex'))) {
          return { success: false, error: 'Incorrect password' }
        }
      } catch {
        return { success: false, error: 'Incorrect password' }
      }
    }
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(SETTING_KEY)
    return { success: true }
  })
}
