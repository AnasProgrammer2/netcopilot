import { safeStorage, app, dialog } from 'electron'
import { randomBytes } from 'crypto'
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import path from 'path'

const KEY_FILE = path.join(app.getPath('userData'), 'netcopilot.key')
/**
 * Holds a freshly generated key while the DB is being re-keyed. If the app
 * dies between `PRAGMA rekey` and promoting this file, getDb() recovers by
 * trying this key (see db.ts).
 */
const PENDING_KEY_FILE = KEY_FILE + '.pending'
/** Prefix for keys stored without OS encryption (headless / no keyring). */
const PLAIN_PREFIX = 'plain:'

let _cachedKey: string | null = null
/** True when the key on disk is not protected by the OS keyring. */
let _insecureKeyStorage = false

function fatalError(title: string, message: string): never {
  dialog.showErrorBox(title, message)
  app.exit(1)
  // Unreachable — satisfies TypeScript return type
  throw new Error(title)
}

/** Write atomically (temp file + rename) with owner-only permissions. */
function writeFileAtomic(file: string, data: Buffer): void {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, data, { mode: 0o600 })
  try {
    renameSync(tmp, file)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* ignore */ }
    throw err
  }
  restrictPermissions(file)
}

function restrictPermissions(file: string): void {
  if (process.platform === 'win32') return
  try { chmodSync(file, 0o600) } catch { /* best effort */ }
}

function encodeKey(key: string, encrypted: boolean): Buffer {
  return encrypted
    ? safeStorage.encryptString(key)
    : Buffer.from(PLAIN_PREFIX + key, 'utf-8')
}

function writeKey(key: string, encrypted: boolean): void {
  if (!encrypted) {
    // No modal here — AppImage/CI and headless sessions have no keyring.
    // Blocking dialogs would replace the main window in catalog screenshots.
    // The renderer shows a non-blocking notice instead (getSecurityWarnings).
    console.warn(
      '[dbKey] OS encryption unavailable — storing database key without Keychain/Secret Service/DPAPI. ' +
      'Unlock the system keyring and restart for full protection.'
    )
  }
  writeFileAtomic(KEY_FILE, encodeKey(key, encrypted))
  _insecureKeyStorage = !encrypted
}

/** True when the key file content is a plaintext (prefixed or legacy hex) key. */
function isPlaintextKeyData(raw: Buffer): boolean {
  const asUtf8 = raw.toString('utf-8')
  return asUtf8.startsWith(PLAIN_PREFIX) || /^[0-9a-f]{64}$/i.test(asUtf8.trim())
}

function decodeKeyData(raw: Buffer): string | null {
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
  return null
}

function readKeyFile(): string {
  const raw = readFileSync(KEY_FILE)
  _insecureKeyStorage = isPlaintextKeyData(raw)
  const key = decodeKeyData(raw)
  if (key !== null) return key

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

  if (existsSync(KEY_FILE)) {
    _cachedKey = readKeyFile()
    restrictPermissions(KEY_FILE)
    return _cachedKey
  }

  // First run — generate a random 32-byte hex key and store it
  const key = randomBytes(32).toString('hex')
  writeKey(key, safeStorage.isEncryptionAvailable())
  _cachedKey = key
  return key
}

/**
 * The key file holds a plaintext key but the OS keyring is now available:
 * the DB should be re-keyed (an old copy of the plaintext key, e.g. in a
 * backup, must stop opening the DB) and the new key stored encrypted.
 */
export function needsKeyUpgrade(): boolean {
  getDbKey()
  return _insecureKeyStorage && safeStorage.isEncryptionAvailable()
}

/** Step 1 of a re-key: persist the new key (encrypted) next to the current one. */
export function stagePendingKey(newKey: string): void {
  writeFileAtomic(PENDING_KEY_FILE, encodeKey(newKey, true))
}

/** Step 3 of a re-key: make the staged key the current one. */
export function promotePendingKey(newKey: string): void {
  renameSync(PENDING_KEY_FILE, KEY_FILE)
  restrictPermissions(KEY_FILE)
  _cachedKey = newKey
  _insecureKeyStorage = false
}

export function discardPendingKey(): void {
  try { unlinkSync(PENDING_KEY_FILE) } catch { /* not there */ }
}

/** Key staged by an interrupted re-key, if any (used for crash recovery). */
export function readPendingKey(): string | null {
  if (!existsSync(PENDING_KEY_FILE)) return null
  try {
    return decodeKeyData(readFileSync(PENDING_KEY_FILE))
  } catch {
    return null
  }
}

/** Fallback when re-keying is not possible: at least encrypt the existing key at rest. */
export function encryptExistingKey(): void {
  if (!safeStorage.isEncryptionAvailable()) return
  writeKey(getDbKey(), true)
}

/** Non-blocking warnings for the renderer to show once per launch. */
let _warningsDelivered = false
export function getSecurityWarnings(): string[] {
  if (_warningsDelivered) return []
  _warningsDelivered = true
  if (!_insecureKeyStorage) return []
  return [
    'No OS keyring is available, so the database key is stored unencrypted on disk ' +
    '(protected by file permissions only) and saved passwords cannot be stored. ' +
    'Unlock or install a keyring (Keychain / Secret Service / DPAPI) and restart NetCopilot for full protection.'
  ]
}
