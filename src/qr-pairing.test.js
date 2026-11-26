import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createEphemeralPairingKeyPair,
  decodePairingPayload,
  decodePairingRequest,
  decryptPairingFromApprover,
  encodePairingPayload,
  encodePairingRequest,
  encryptPairingForRequester,
} from './sync/qr-pairing.js'

test('QR pairing direct flow encodes, decodes, and rejects expired payloads', () => {
  const creds = {
    server: 'https://sync.example.com',
    token: 'tok-123',
    key: 'a2V5LWJhc2U2NA==',
    email: 'user@example.com',
    name: 'Douglas',
  }
  const now = 1_700_000_000_000
  const encoded = encodePairingPayload(creds, { now, ttlMs: 120_000 })
  assert.equal(encoded.ok, true)

  const decoded = decodePairingPayload(encoded.payload, { now: now + 30_000 })
  assert.deepEqual(decoded, { ok: true, credentials: creds, error: null })

  const expired = decodePairingPayload(encoded.payload, { now: now + 130_000 })
  assert.equal(expired.ok, false)
  assert.equal(expired.error, 'expired')
})

test('QR pairing reverse (WhatsApp-style) ECDH + AES-GCM round trip keeps key opaque', async () => {
  const { privateKey, pub } = await createEphemeralPairingKeyPair()
  const qr = encodePairingRequest({ server: 'https://sync.example.com', id: 'pair-1', pub })
  const parsed = decodePairingRequest(qr)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.request.id, 'pair-1')

  const creds = {
    server: 'https://sync.example.com',
    token: 'tok-abc',
    key: 'c2VjcmV0LWtleQ==',
    email: 'user@example.com',
    name: 'Douglas',
  }
  const encrypted = await encryptPairingForRequester(parsed.request.pub, creds)
  assert.ok(encrypted.ct && encrypted.iv && encrypted.epk)
  assert.equal(JSON.stringify(encrypted).includes(creds.token), false)

  const decrypted = await decryptPairingFromApprover(privateKey, encrypted)
  assert.deepEqual(decrypted, creds)
})
