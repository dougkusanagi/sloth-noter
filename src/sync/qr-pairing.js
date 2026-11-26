export const PAIR_DIRECT_PREFIX = 'slothnote:pair:v1:'
export const PAIR_REQUEST_PREFIX = 'slothnote:pair-req:v1:'
export const PAIR_TTL_MS = 2 * 60 * 1000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64Url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Encodes sync credentials into a short-lived direct pairing QR payload (`slothnote:pair:v1:...`).
 */
export function encodePairingPayload(
  { server, token, key, email = '', name = '' },
  { now = Date.now(), ttlMs = PAIR_TTL_MS } = {},
) {
  if (!server || !token || !key) return { ok: false, payload: '', error: 'incomplete' }
  const json = JSON.stringify({
    v: 1,
    server,
    token,
    key,
    email,
    name,
    exp: now + ttlMs,
  })
  return {
    ok: true,
    payload: `${PAIR_DIRECT_PREFIX}${toBase64Url(encoder.encode(json))}`,
    expiresAt: now + ttlMs,
    error: null,
  }
}

/**
 * Decodes and validates a direct pairing QR payload. Rejects expired or malformed codes.
 */
export function decodePairingPayload(raw, { now = Date.now() } = {}) {
  if (typeof raw !== 'string' || !raw.trim().startsWith(PAIR_DIRECT_PREFIX)) {
    return { ok: false, credentials: null, error: 'invalid_prefix' }
  }
  try {
    const encoded = raw.trim().slice(PAIR_DIRECT_PREFIX.length)
    const parsed = JSON.parse(decoder.decode(fromBase64Url(encoded)))
    if (parsed?.v !== 1 || !parsed.server || !parsed.token || !parsed.key) {
      return { ok: false, credentials: null, error: 'invalid_format' }
    }
    if (typeof parsed.exp !== 'number' || parsed.exp < now) {
      return { ok: false, credentials: null, error: 'expired' }
    }
    return {
      ok: true,
      credentials: {
        server: String(parsed.server),
        token: String(parsed.token),
        key: String(parsed.key),
        email: typeof parsed.email === 'string' ? parsed.email : '',
        name: typeof parsed.name === 'string' ? parsed.name : '',
      },
      error: null,
    }
  } catch {
    return { ok: false, credentials: null, error: 'corrupted' }
  }
}

/**
 * Encodes a WhatsApp-style reverse pairing request (`slothnote:pair-req:v1:...`).
 */
export function encodePairingRequest({ server, id, pub }) {
  if (!server || !id || !pub) return ''
  const json = JSON.stringify({ v: 1, server, id, pub })
  return `${PAIR_REQUEST_PREFIX}${toBase64Url(encoder.encode(json))}`
}

/**
 * Decodes a reverse pairing request QR scanned by the logged-in device.
 */
export function decodePairingRequest(raw) {
  if (typeof raw !== 'string' || !raw.trim().startsWith(PAIR_REQUEST_PREFIX)) {
    return { ok: false, request: null, error: 'invalid_prefix' }
  }
  try {
    const encoded = raw.trim().slice(PAIR_REQUEST_PREFIX.length)
    const parsed = JSON.parse(decoder.decode(fromBase64Url(encoded)))
    if (parsed?.v !== 1 || !parsed.server || !parsed.id || !parsed.pub) {
      return { ok: false, request: null, error: 'invalid_format' }
    }
    return {
      ok: true,
      request: { server: String(parsed.server), id: String(parsed.id), pub: parsed.pub },
      error: null,
    }
  } catch {
    return { ok: false, request: null, error: 'corrupted' }
  }
}

/** Generates an ephemeral ECDH P-256 key pair for the logged-out device (requester). */
export async function createEphemeralPairingKeyPair(subtle = crypto.subtle) {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
  const pub = await subtle.exportKey('jwk', pair.publicKey)
  return { privateKey: pair.privateKey, pub }
}

/**
 * Encrypts sync credentials for the requester's ephemeral public key using ECDH + AES-256-GCM.
 * The server only relays this opaque ciphertext and never sees the user's sync key.
 */
export async function encryptPairingForRequester(requesterPubJwk, credentials, subtle = crypto.subtle) {
  const requesterPub = await subtle.importKey(
    'jwk',
    requesterPubJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const senderPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
  ])
  const aesKey = await subtle.deriveKey(
    { name: 'ECDH', public: requesterPub },
    senderPair.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(credentials))
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext))
  const epk = await subtle.exportKey('jwk', senderPair.publicKey)
  return {
    epk,
    iv: toBase64Url(iv),
    ct: toBase64Url(ciphertext),
  }
}

/** Decrypts the credentials received from the logged-in device on the requester. */
export async function decryptPairingFromApprover(
  requesterPrivateKey,
  encrypted,
  subtle = crypto.subtle,
) {
  const senderPub = await subtle.importKey(
    'jwk',
    encrypted.epk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const aesKey = await subtle.deriveKey(
    { name: 'ECDH', public: senderPub },
    requesterPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(encrypted.iv) },
    aesKey,
    fromBase64Url(encrypted.ct),
  )
  return JSON.parse(decoder.decode(new Uint8Array(plaintext)))
}
