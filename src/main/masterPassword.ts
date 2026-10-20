import { IpcMain, safeStorage } from 'electron'
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'crypto'
import { getDb } from './db'

const SETTING_KEY = 'masterPasswordHash'
const SALT_BYTES  = 16
const KEY_LEN     = 32
// scrypt parameters — deliberately slow to resist offline brute-force
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const

// ── Rate limiting (per-process, resets on restart) ───────────────────────────
let _verifyFailures = 0
let _verifyLockedUntil = 0

function checkRateLimit(): boolean {
  return Date.now() >= _verifyLockedUntil
}

function recordVerifyFailure(): void {
  _verifyFailures++
  if (_verifyFailures >= 5) {
    // Exponential backoff: 2^(failures-4) seconds, cap at 5 minutes
    const delaySecs = Math.min(Math.pow(2, _verifyFailures - 4), 300)
    _verifyLockedUntil = Date.now() + delaySecs * 1000
  }
}

function recordVerifySuccess(): void {
  _verifyFailures = 0
  _verifyLockedUntil = 0
}

// ── Hashing ──────────────────────────────────────────────────────────────────

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, SCRYPT_OPTS)
}

/** Encode salt + hash as a single storable string: "saltHex:hashHex" */
function encodeRecord(salt: Buffer, hash: Buffer): string {
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function decodeRecord(encoded: string): { salt: Buffer; hash: Buffer } | null {
  const colon = encoded.indexOf(':')
  if (colon < 0) return null
  const saltHex = encoded.slice(0, colon)
  const hashHex = encoded.slice(colon + 1)
  if (!saltHex || !hashHex) return null
  try {
    return { salt: Buffer.from(saltHex, 'hex'), hash: Buffer.from(hashHex, 'hex') }
  } catch {
    return null
  }
}

// ── Persistence (via safeStorage → SQLite settings table) ────────────────────

function saveHash(record: string): void {
  const db = getDb()
  const encoded = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(record).toString('base64')
    : Buffer.from(record).toString('base64')
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run({ key: SETTING_KEY, value: JSON.stringify(encoded) })
}

function loadHash(): string | null {
  const db  = getDb()
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

// ── Lock state ───────────────────────────────────────────────────────────────
// The renderer lock screen is only UI; this flag is what actually gates access
// to stored credentials in the main process. Starts locked; with no master
// password configured the app is always considered unlocked.
let _unlocked = false

export function hasMasterPassword(): boolean {
  return loadHash() !== null
}

export function isUnlocked(): boolean {
  if (_unlocked) return true
  try {
    return !hasMasterPassword()
  } catch {
    return false
  }
}

/**
 * Check `password` against the stored record (scrypt or legacy SHA-256).
 * Returns null when no master password is set. Upgrades legacy hashes.
 */
function checkPassword(password: string): boolean | null {
  const stored = loadHash()
  if (!stored) return null
  if (typeof password !== 'string') return false

  // ── Legacy migration: old SHA-256 hashes have no colon (64-char hex) ──────
  const isLegacyFormat = !stored.includes(':') && /^[0-9a-f]{64}$/.test(stored)
  if (isLegacyFormat) {
    const legacyAttempt = createHash('sha256').update(`netcopilot:${password}`).digest('hex')
    let legacyOk = false
    try {
      legacyOk = timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(legacyAttempt, 'hex'))
    } catch { legacyOk = false }

    if (legacyOk) {
      // Correct password — silently upgrade to scrypt
      const salt = randomBytes(SALT_BYTES)
      const hash = hashPassword(password, salt)
      saveHash(encodeRecord(salt, hash))
    }
    return legacyOk
  }

  const record = decodeRecord(stored)
  if (!record) return false
  try {
    return timingSafeEqual(record.hash, hashPassword(password, record.salt))
  } catch {
    return false
  }
}

/** Rate-limited verification of the current master password. */
async function verifyCurrent(password: string): Promise<{ ok: boolean; error?: string }> {
  if (!checkRateLimit()) {
    await new Promise<void>((r) => setTimeout(r, 1000)) // brief delay to slow automated retries
    return { ok: false, error: 'Too many attempts — try again later' }
  }
  const result = checkPassword(password)
  if (result === null) return { ok: true } // no master password set
  if (result) {
    recordVerifySuccess()
    return { ok: true }
  }
  recordVerifyFailure()
  return { ok: false, error: 'Incorrect password' }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

export function setupMasterPasswordHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('auth:hasMasterPassword', () => hasMasterPassword())

  ipcMain.handle('auth:setMasterPassword', async (_, password: string, currentPassword?: string) => {
    if (!password || typeof password !== 'string' || password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' }
    }
    // Changing an existing master password requires the current one.
    if (hasMasterPassword()) {
      const check = await verifyCurrent(currentPassword ?? '')
      if (!check.ok) return { success: false, error: check.error ?? 'Current password is incorrect' }
    }
    const salt = randomBytes(SALT_BYTES)
    const hash = hashPassword(password, salt)
    saveHash(encodeRecord(salt, hash))
    _unlocked = true
    return { success: true }
  })

  ipcMain.handle('auth:verifyMasterPassword', async (_, password: string) => {
    if (!hasMasterPassword()) return false // no password set → not verified
    const check = await verifyCurrent(password)
    if (check.ok) _unlocked = true
    return check.ok
  })

  ipcMain.handle('auth:clearMasterPassword', async (_, currentPassword: string) => {
    if (hasMasterPassword()) {
      const check = await verifyCurrent(currentPassword)
      if (!check.ok) return { success: false, error: check.error ?? 'Incorrect password' }
    }
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(SETTING_KEY)
    _unlocked = true
    return { success: true }
  })

  // Idle auto-lock: seal stored credentials until the password is entered again.
  ipcMain.handle('auth:lock', () => {
    if (hasMasterPassword()) _unlocked = false
    return true
  })
}
