import { IpcMain, safeStorage } from 'electron'
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'
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

// ── IPC Handlers ─────────────────────────────────────────────────────────────

export function setupMasterPasswordHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('auth:hasMasterPassword', () => loadHash() !== null)

  ipcMain.handle('auth:setMasterPassword', (_, password: string) => {
    if (!password || password.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters' }
    }
    const salt = randomBytes(SALT_BYTES)
    const hash = hashPassword(password, salt)
    saveHash(encodeRecord(salt, hash))
    return { success: true }
  })

  ipcMain.handle('auth:verifyMasterPassword', async (_, password: string) => {
    // Rate limiting — return false immediately while in lockout window
    if (!checkRateLimit()) {
      await new Promise<void>((r) => setTimeout(r, 1000)) // brief delay to slow automated retries
      return false
    }

    const stored = loadHash()
    if (!stored) return false // M3 fix: no password set → not verified (caller checks hasMasterPassword first)

    const record = decodeRecord(stored)
    if (!record) return false

    try {
      const attempt = hashPassword(password, record.salt)
      const ok = timingSafeEqual(record.hash, attempt)
      if (ok) {
        recordVerifySuccess()
      } else {
        recordVerifyFailure()
      }
      return ok
    } catch {
      return false
    }
  })

  ipcMain.handle('auth:clearMasterPassword', (_, currentPassword: string) => {
    const stored = loadHash()
    if (stored) {
      const record = decodeRecord(stored)
      if (!record) return { success: false, error: 'Incorrect password' }
      try {
        const attempt = hashPassword(currentPassword, record.salt)
        if (!timingSafeEqual(record.hash, attempt)) {
          return { success: false, error: 'Incorrect password' }
        }
      } catch {
        return { success: false, error: 'Incorrect password' }
      }
    }
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(SETTING_KEY)
    recordVerifySuccess() // reset rate limiting on successful clear
    return { success: true }
  })
}
