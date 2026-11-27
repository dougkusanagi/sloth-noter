import test from 'node:test'
import assert from 'node:assert/strict'
import { QR_PREFIX, decodeQrNotePayload, encodeNoteForQr } from './qr-bridge.js'

test('C1: encodes and decodes a short Markdown note offline via QR payload', () => {
  const body = '# Lista rápida\n\n- [ ] Comprar café\n- [x] Enviar relatório\n'
  const encoded = encodeNoteForQr(body)
  assert.equal(encoded.ok, true)
  assert.equal(encoded.hasImages, false)
  assert.ok(encoded.payload.startsWith(QR_PREFIX))

  const decoded = decodeQrNotePayload(encoded.payload)
  assert.deepEqual(decoded, { ok: true, body, error: null })
})

test('C1: strips inline data images with warning and rejects oversized or corrupted payloads', () => {
  const withImage = '# Foto\n\n![quadro](data:image/png;base64,AAAA)\nTexto'
  const encoded = encodeNoteForQr(withImage)
  assert.equal(encoded.ok, true)
  assert.equal(encoded.hasImages, true)
  const decoded = decodeQrNotePayload(encoded.payload)
  assert.equal(decoded.body, '# Foto\n\n[imagem: quadro]\nTexto')

  const huge = `# Grande\n\n${Array.from({ length: 4000 }, (_, i) => `palavra-${i}-${(i * 37) % 997}`).join(' ')}`
  const tooLarge = encodeNoteForQr(huge)
  assert.equal(tooLarge.ok, false)
  assert.equal(tooLarge.error, 'too_large')

  assert.equal(decodeQrNotePayload('https://example.com').ok, false)
  assert.equal(decodeQrNotePayload(`${QR_PREFIX}!!!invalido!!!`).ok, false)
})
