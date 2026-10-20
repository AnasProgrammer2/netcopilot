import { IpcMain, BrowserWindow } from 'electron'
import { Client } from 'ssh2'
import { createHash, randomUUID } from 'crypto'
import { getDb } from './db'

// ── SSH host key verification (trust on first use) ──────────────────────────
//
// Known host keys live in the encrypted app DB (`known_hosts` table), keyed by
// host + port + key type, storing an OpenSSH-style SHA256 fingerprint.
// Unknown or changed keys are confirmed by the user through a renderer dialog.

const PROMPT_TIMEOUT_MS = 120_000

export interface HostKeyPrompt {
  requestId:       string
  host:            string
  port:            number
  keyType:         string
  fingerprint:     string
  changed:         boolean
  oldFingerprint?: string
  oldKeyType?:     string
}

interface KnownHostRow {
  key_type:    string
  fingerprint: string
}

const pendingPrompts = new Map<string, {
  client:  Client
  resolve: (accept: boolean) => void
  timer:   ReturnType<typeof setTimeout>
}>()

/** Reject (and dismiss) any open prompt for a connection we are closing. */
export function cancelHostKeyPrompts(client: Client): void {
  for (const pending of [...pendingPrompts.values()]) {
    if (pending.client === client) pending.resolve(false)
  }
}

/** OpenSSH-compatible fingerprint: "SHA256:" + unpadded base64 of sha256(key blob). */
export function fingerprintSha256(key: Buffer): string {
  return 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
}

/** Key type from the SSH wire-format blob (length-prefixed string, e.g. "ssh-ed25519"). */
function keyTypeOf(key: Buffer): string {
  try {
    const len = key.readUInt32BE(0)
    if (len > 0 && len < 64 && key.length >= 4 + len) return key.subarray(4, 4 + len).toString('ascii')
  } catch { /* malformed blob */ }
  return 'unknown'
}

const normHost = (host: string): string => host.trim().toLowerCase()

function lookupKnownKeys(host: string, port: number): KnownHostRow[] {
  return getDb()
    .prepare('SELECT key_type, fingerprint FROM known_hosts WHERE host = ? AND port = ?')
    .all(normHost(host), port) as KnownHostRow[]
}

/** Replace all stored keys for host:port with the accepted one. */
function saveKnownKey(host: string, port: number, keyType: string, fingerprint: string): void {
  const db = getDb()
  const now = Date.now()
  db.transaction(() => {
    db.prepare('DELETE FROM known_hosts WHERE host = ? AND port = ?').run(normHost(host), port)
    db.prepare(
      'INSERT INTO known_hosts (host, port, key_type, fingerprint, added_at) VALUES (?, ?, ?, ?, ?)'
    ).run(normHost(host), port, keyType, fingerprint, now)
  })()
}

function askRenderer(
  getWindow: () => BrowserWindow | null,
  prompt: Omit<HostKeyPrompt, 'requestId'>,
  client: Client,
): Promise<boolean> {
  const win = getWindow()
  if (!win || win.isDestroyed()) return Promise.resolve(false)

  const requestId = randomUUID()
  return new Promise<boolean>((resolve) => {
    const finish = (accept: boolean) => {
      const pending = pendingPrompts.get(requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      pendingPrompts.delete(requestId)
      client.removeListener('close', onClose)
      if (!win.isDestroyed()) win.webContents.send('ssh:host-key-prompt-cancel', requestId)
      resolve(accept)
    }
    // Connection dropped (tab closed, server timeout) — dismiss the dialog.
    const onClose = () => finish(false)
    client.once('close', onClose)

    const timer = setTimeout(() => finish(false), PROMPT_TIMEOUT_MS)
    pendingPrompts.set(requestId, { client, resolve: finish, timer })
    win.webContents.send('ssh:host-key-prompt', { requestId, ...prompt } satisfies HostKeyPrompt)
  })
}

/**
 * Build an ssh2 `hostVerifier` for `client` connecting to host:port.
 *
 * Must stay a plain (non-async) function returning undefined: ssh2 treats any
 * non-undefined return value as the synchronous verdict, so returning a
 * Promise would be read as "accept".
 */
export function createHostVerifier(
  client: Client,
  host: string,
  port: number,
  getWindow: () => BrowserWindow | null,
): (key: Buffer, verify: (valid: boolean) => void) => void {
  return (key: Buffer, verify: (valid: boolean) => void): void => {
    let keyType: string
    let fingerprint: string
    let known: KnownHostRow[]
    try {
      keyType     = keyTypeOf(key)
      fingerprint = fingerprintSha256(key)
      known       = lookupKnownKeys(host, port)
    } catch (err) {
      console.error('[hostKeys] verification failed:', err)
      verify(false)
      return
    }

    const sameType = known.find((k) => k.key_type === keyType)
    if (sameType && sameType.fingerprint === fingerprint) {
      verify(true)
      return
    }

    // Unknown host, or a key that differs from the stored one (including a
    // different key type than the one we trusted — treated as a change).
    const previous = sameType ?? known[0]
    const changed  = previous !== undefined

    // The user may take longer than ssh2's readyTimeout to decide; pause it
    // while the dialog is open (re-armed below once the user answers).
    const internal = client as unknown as { _readyTimeout?: ReturnType<typeof setTimeout> }
    const hadReadyTimeout = internal._readyTimeout !== undefined
    if (hadReadyTimeout) clearTimeout(internal._readyTimeout)

    askRenderer(getWindow, {
      host, port, keyType, fingerprint, changed,
      oldFingerprint: previous?.fingerprint,
      oldKeyType:     previous?.key_type,
    }, client).then((accept) => {
      if (accept) {
        try {
          saveKnownKey(host, port, keyType, fingerprint)
        } catch (err) {
          console.error('[hostKeys] failed to save host key:', err)
        }
        if (hadReadyTimeout) {
          // Give the remaining handshake + auth a fresh 30s budget.
          const timer = setTimeout(() => {
            const err = Object.assign(new Error('Timed out while waiting for handshake'), { level: 'client-timeout' })
            client.emit('error', err)
            client.end()
          }, 30_000)
          const clear = () => clearTimeout(timer)
          client.once('ready', clear)
          client.once('close', clear)
        }
      }
      try { verify(accept) } catch { /* connection already torn down */ }
    })
  }
}

export function setupHostKeyHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ssh:host-key-response', (_, requestId: string, accept: boolean) => {
    const pending = pendingPrompts.get(requestId)
    if (!pending) return false
    pending.resolve(accept === true)
    return true
  })

  ipcMain.handle('ssh:host-key-forget', (_, host: string, port: number) => {
    getDb().prepare('DELETE FROM known_hosts WHERE host = ? AND port = ?').run(normHost(host), Number(port))
    return true
  })
}
