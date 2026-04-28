/**
 * AES-GCM encryption/decryption using the Web Crypto API.
 * Key is derived from a user-supplied password via PBKDF2 (100 000 iterations, SHA-256).
 */

const PBKDF2_ITERATIONS = 100_000

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptData(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const iv   = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const key  = await deriveKey(password, salt)
  const enc  = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  // Pack: salt (16 bytes) + iv (12 bytes) + ciphertext → hex
  const combined = new Uint8Array(16 + 12 + ciphertext.byteLength)
  combined.set(salt, 0)
  combined.set(iv, 16)
  combined.set(new Uint8Array(ciphertext), 28)
  return bufToHex(combined.buffer)
}

export async function decryptData(hex: string, password: string): Promise<string> {
  const combined = hexToBuf(hex)
  const salt     = combined.slice(0, 16) as Uint8Array<ArrayBuffer>
  const iv       = combined.slice(16, 28) as Uint8Array<ArrayBuffer>
  const data     = combined.slice(28)
  const key      = await deriveKey(password, salt)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plainBuf)
}
