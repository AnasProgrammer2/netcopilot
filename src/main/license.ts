import { IpcMain } from 'electron'
import { machineId } from 'node-machine-id'
import crypto from 'crypto'
import os from 'os'
import { getDb } from './db'

const API_BASE = 'https://api.netcopilot.app'

// ── Device ID ─────────────────────────────────────────────────────────────────

let _deviceId: string | null = null

function fallbackDeviceId(): string {
  return crypto.createHash('sha256').update(`${os.hostname()}-${os.platform()}-${os.userInfo().username}`).digest('hex')
}

export async function getDeviceId(): Promise<string> {
  if (_deviceId) return _deviceId
  try {
    _deviceId = await machineId(true)
  } catch {
    _deviceId = fallbackDeviceId()
  }
  return _deviceId
}

// ── License key storage (safeStorage / DB) ────────────────────────────────────

export async function loadLicenseKey(): Promise<string | null> {
  try {
    const db  = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'license.key'").get() as { value: string } | undefined
    if (!row) return null
    const { safeStorage } = await import('electron')
    const encoded: string = JSON.parse(row.value)
    const buf = Buffer.from(encoded, 'base64')
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf-8')
  } catch {
    return null
  }
}

async function saveLicenseKey(key: string): Promise<void> {
  const db = getDb()
  const { safeStorage } = await import('electron')
  const encoded = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key).toString('base64')
    : Buffer.from(key).toString('base64')
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('license.key', @v) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run({ v: JSON.stringify(encoded) })
}

// ── License verification against backend ──────────────────────────────────────

export interface LicenseStatus {
  valid:     boolean
  plan:      string
  expiresAt: string | null
  reason?:   string
}

export async function verifyLicenseOnline(licenseKey: string): Promise<LicenseStatus> {
  const deviceId = await getDeviceId()
  const res = await fetch(`${API_BASE}/api/license/verify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ licenseKey: licenseKey.trim().toUpperCase(), deviceId }),
  })

  if (!res.ok) {
    let reason = `HTTP ${res.status}`
    try {
      const body = await res.json() as { error?: string }
      if (body.error) reason = body.error
    } catch { /* ignore */ }
    return { valid: false, plan: '', expiresAt: null, reason }
  }

  const data = await res.json() as { valid: boolean; plan: string; expires_at: string | null; reason?: string }
  return {
    valid:     data.valid,
    plan:      data.plan ?? '',
    expiresAt: data.expires_at ?? null,
    reason:    data.reason,
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

export function setupLicenseHandlers(ipcMain: IpcMain): void {
  // Get current license key (masked for UI display)
  ipcMain.handle('license:get', async () => {
    const key = await loadLicenseKey()
    if (!key) return null
    if (key.length <= 8) return '****'
    return key.slice(0, 4) + '****' + key.slice(-4)
  })

  // Save license key
  ipcMain.handle('license:set', async (_, key: string) => {
    await saveLicenseKey(key.trim().toUpperCase())
    return true
  })

  // Verify license key against backend
  ipcMain.handle('license:verify', async () => {
    const key = await loadLicenseKey()
    if (!key) return { valid: false, plan: '', expiresAt: null, reason: 'No license key stored.' }
    return verifyLicenseOnline(key)
  })

  // Get device fingerprint
  ipcMain.handle('license:device-id', async () => {
    return await getDeviceId()
  })

  // Activate a new license key: save + verify
  ipcMain.handle('license:activate', async (_, key: string) => {
    const cleaned = key.trim().toUpperCase()
    const result = await verifyLicenseOnline(cleaned)
    if (result.valid) {
      await saveLicenseKey(cleaned)
    }
    return result
  })
}
