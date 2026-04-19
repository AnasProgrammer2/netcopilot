import { safeStorage, app, dialog } from 'electron'
import { randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

const KEY_FILE = path.join(app.getPath('userData'), 'netcopilot.key')

let _cachedKey: string | null = null

function fatalError(title: string, message: string): never {
  dialog.showErrorBox(title, message)
  app.exit(1)
  // Unreachable — satisfies TypeScript return type
  throw new Error(title)
}

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    fatalError(
      'Encryption Unavailable',
      'NetCopilot requires OS-level encryption (Keychain / Secret Service / DPAPI) to protect your database key.\n\n' +
      'Please make sure you are logged into a desktop session with the system keyring unlocked, then restart the app.'
    )
  }
}

export function getDbKey(): string {
  if (_cachedKey) return _cachedKey

  requireEncryption()

  if (existsSync(KEY_FILE)) {
    try {
      const raw = readFileSync(KEY_FILE)
      _cachedKey = safeStorage.decryptString(raw)
      return _cachedKey
    } catch {
      fatalError(
        'Database Key Error',
        'NetCopilot could not decrypt the database key.\n\n' +
        'The key file may be corrupt or was encrypted under a different user account.\n\n' +
        'If you have a backup, restore "netcopilot.key" and "netcopilot.db" from it.\n' +
        'Otherwise, delete both files in your app data folder to start fresh (all data will be lost).\n\n' +
        'App data folder: ' + app.getPath('userData')
      )
    }
  }

  // First run — generate a random 32-byte hex key and store it encrypted
  const key = randomBytes(32).toString('hex')
  writeFileSync(KEY_FILE, safeStorage.encryptString(key))
  _cachedKey = key
  return key
}
