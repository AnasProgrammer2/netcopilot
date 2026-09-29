import { safeStorage, app, dialog } from 'electron'
import { randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

const KEY_FILE = path.join(app.getPath('userData'), 'netcopilot.key')
/** Prefix for keys stored without OS encryption (headless / no keyring). */
const PLAIN_PREFIX = 'plain:'

let _cachedKey: string | null = null

function fatalError(title: string, message: string): never {
  dialog.showErrorBox(title, message)
  app.exit(1)
  // Unreachable — satisfies TypeScript return type
  throw new Error(title)
}

function writeKey(key: string, encrypted: boolean): void {
  if (encrypted) {
    writeFileSync(KEY_FILE, safeStorage.encryptString(key))
  } else {
    // No modal here — AppImage/CI and headless sessions have no keyring.
    // Blocking dialogs would replace the main window in catalog screenshots.
    console.warn(
      '[dbKey] OS encryption unavailable — storing database key without Keychain/Secret Service/DPAPI. ' +
      'Unlock the system keyring and restart for full protection.'
    )
    writeFileSync(KEY_FILE, Buffer.from(PLAIN_PREFIX + key, 'utf-8'))
  }
}

function readKeyFile(): string {
  const raw = readFileSync(KEY_FILE)

  // Insecure fallback format (explicit prefix)
  const asUtf8 = raw.toString('utf-8')
  if (asUtf8.startsWith(PLAIN_PREFIX)) {
    return asUtf8.slice(PLAIN_PREFIX.length)
  }

  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(raw)
    } catch {
      // Fall through — may be a legacy plain hex file
    }
  }

  // Legacy / CI: raw hex key written as utf-8 (64 hex chars)
  if (/^[0-9a-f]{64}$/i.test(asUtf8.trim())) {
    return asUtf8.trim()
  }

  fatalError(
    'Database Key Error',
    'NetCopilot could not decrypt the database key.\n\n' +
    'The key file may be corrupt or was encrypted under a different user account.\n\n' +
    'If you have a backup, restore "netcopilot.key" and "netcopilot.db" from it.\n' +
    'Otherwise, delete both files in your app data folder to start fresh (all data will be lost).\n\n' +
    'App data folder: ' + app.getPath('userData')
  )
}

export function getDbKey(): string {
  if (_cachedKey) return _cachedKey

  const encrypted = safeStorage.isEncryptionAvailable()

  if (existsSync(KEY_FILE)) {
    _cachedKey = readKeyFile()
    // Upgrade plain key to OS-encrypted when keyring becomes available
    if (encrypted) {
      const raw = readFileSync(KEY_FILE)
      const asUtf8 = raw.toString('utf-8')
      if (asUtf8.startsWith(PLAIN_PREFIX) || /^[0-9a-f]{64}$/i.test(asUtf8.trim())) {
        try { writeKey(_cachedKey, true) } catch { /* keep working with memory key */ }
      }
    }
    return _cachedKey
  }

  // First run — generate a random 32-byte hex key and store it
  const key = randomBytes(32).toString('hex')
  writeKey(key, encrypted)
  _cachedKey = key
  return key
}
