import { safeStorage, app } from 'electron'
import { randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

const KEY_FILE = path.join(app.getPath('userData'), 'netcopilot.key')

let _cachedKey: string | null = null

export function getDbKey(): string {
  if (_cachedKey) return _cachedKey

  if (existsSync(KEY_FILE)) {
    try {
      const raw = readFileSync(KEY_FILE)
      if (safeStorage.isEncryptionAvailable()) {
        _cachedKey = safeStorage.decryptString(raw)
      } else {
        _cachedKey = raw.toString('utf-8')
      }
      return _cachedKey
    } catch {
      // Key file corrupt — generate a new one (data will be lost, but this is an extreme edge case)
    }
  }

  // First run: generate a random 32-byte hex key
  const key = randomBytes(32).toString('hex')
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(KEY_FILE, safeStorage.encryptString(key))
  } else {
    writeFileSync(KEY_FILE, key, 'utf-8')
  }
  _cachedKey = key
  return key
}
