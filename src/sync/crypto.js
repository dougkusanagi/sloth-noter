// End-to-end encryption for sync (ADR 0018), on the platform Web Crypto API:
// AES-256-GCM with a random 96-bit IV per envelope. Nothing here is custom crypto.
// The note id is authenticated data, so an envelope cannot be moved to another note.

const VERSION = 1
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64Url = (bytes) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (text) => {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('invalid envelope')
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const importKey = (raw) =>
  crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])

/** New random 256-bit key, returned as raw bytes for the vault. */
export function generateKeyBytes() {
  return crypto.getRandomValues(new Uint8Array(32))
}

async function seal(rawKey, plain, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
      await importKey(rawKey),
      plain,
    ),
  )
  const out = new Uint8Array(1 + iv.length + cipher.length)
  out[0] = VERSION
  out.set(iv, 1)
  out.set(cipher, 1 + iv.length)
  return out
}

async function open(rawKey, sealed, context) {
  if (sealed[0] !== VERSION || sealed.length < 1 + 12 + 16) throw new Error('invalid envelope')
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.slice(1, 13), additionalData: encoder.encode(context) },
      await importKey(rawKey),
      sealed.slice(13),
    ),
  )
}

/** Encrypts a note payload (any JSON value) into the text envelope the server stores. */
export async function encryptNote(rawKey, id, payload) {
  const envelope = toBase64Url(
    await seal(rawKey, encoder.encode(JSON.stringify(payload)), `note:${id}`),
  )
  return { envelope, hash: await sha256Hex(envelope) }
}

/** Throws when the key is wrong, the envelope was changed or belongs to another note. */
export async function decryptNote(rawKey, id, envelope) {
  return JSON.parse(decoder.decode(await open(rawKey, fromBase64Url(envelope), `note:${id}`)))
}

/** Encrypts image bytes once; `sha256` (of the envelope) is the blob address. */
export async function encryptBlob(rawKey, imageId, bytes) {
  const sealed = await seal(rawKey, bytes, `blob:${imageId}`)
  return { bytes: sealed, sha256: await sha256Hex(sealed) }
}

export async function decryptBlob(rawKey, imageId, sealed, sha256) {
  if ((await sha256Hex(sealed)) !== sha256) throw new Error('blob hash mismatch')
  return open(rawKey, sealed, `blob:${imageId}`)
}

// Recovery key: Crockford base32 of key + 2-byte checksum, in groups of five.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export async function recoveryKey(rawKey) {
  const check = new Uint8Array(await crypto.subtle.digest('SHA-256', rawKey)).slice(0, 2)
  const bytes = new Uint8Array([...rawKey, ...check])
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31]
  return out.match(/.{1,5}/g).join('-')
}

/** Accepts the typed recovery key with any case, spaces or dashes; null if invalid. */
export async function keyFromRecovery(text) {
  const clean = String(text)
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (!/^[0-9A-HJKMNP-TV-Z]+$/.test(clean)) return null
  let bits = 0
  let value = 0
  const bytes = []
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  if (bytes.length !== 34) return null
  const key = new Uint8Array(bytes.slice(0, 32))
  const check = new Uint8Array(await crypto.subtle.digest('SHA-256', key)).slice(0, 2)
  return check[0] === bytes[32] && check[1] === bytes[33] ? key : null
}
