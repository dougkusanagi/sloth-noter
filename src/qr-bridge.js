import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'

export const QR_PREFIX = 'slothnote:qr:v1:'
export const QR_MAX_PAYLOAD_CHARS = 2200

const DATA_IMAGE_RE = /!\[([^\]]*)\]\(data:image\/[^)]+\)/g
const ASSET_IMAGE_RE = /!\[[^\]]*\]\((?:assets\/|[^)\s]+\.(?:png|jpe?g|webp|gif|svg))\)/i

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
 * Encodes a short Markdown note into an offline QR payload (`slothnote:qr:v1:...`).
 * Strips inline `data:image/...` payloads and reports `hasImages: true` when images are present.
 */
export function encodeNoteForQr(body, { maxPayloadChars = QR_MAX_PAYLOAD_CHARS } = {}) {
  const raw = String(body ?? '').replaceAll('\r\n', '\n')
  if (!raw.trim()) {
    return { ok: false, payload: '', chars: 0, hasImages: false, error: 'empty' }
  }
  const hasDataImage = DATA_IMAGE_RE.test(raw)
  DATA_IMAGE_RE.lastIndex = 0
  const hasAssetImage = ASSET_IMAGE_RE.test(raw)
  const hasImages = hasDataImage || hasAssetImage

  const sanitized = hasDataImage
    ? raw.replace(DATA_IMAGE_RE, (_, alt) => (alt ? `[imagem: ${alt}]` : '[imagem]'))
    : raw

  const json = JSON.stringify({ v: 1, body: sanitized })
  const compressed = deflateSync(strToU8(json), { level: 9 })
  const payload = `${QR_PREFIX}${toBase64Url(compressed)}`

  if (payload.length > maxPayloadChars) {
    return {
      ok: false,
      payload: '',
      chars: payload.length,
      hasImages,
      error: 'too_large',
    }
  }

  return {
    ok: true,
    payload,
    chars: payload.length,
    hasImages,
    error: null,
  }
}

/**
 * Decodes an offline QR payload back into `{ ok, body, error }`.
 */
export function decodeQrNotePayload(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(QR_PREFIX)) {
    return { ok: false, body: '', error: 'invalid_prefix' }
  }
  try {
    const encoded = payload.slice(QR_PREFIX.length).trim()
    if (!encoded) return { ok: false, body: '', error: 'empty' }
    const inflated = inflateSync(fromBase64Url(encoded))
    const parsed = JSON.parse(strFromU8(inflated))
    if (parsed?.v !== 1 || typeof parsed.body !== 'string' || !parsed.body.trim()) {
      return { ok: false, body: '', error: 'invalid_format' }
    }
    return { ok: true, body: parsed.body, error: null }
  } catch {
    return { ok: false, body: '', error: 'corrupted' }
  }
}
