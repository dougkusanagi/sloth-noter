import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decryptBlob,
  decryptNote,
  encryptBlob,
  encryptNote,
  generateKeyBytes,
  keyFromRecovery,
  recoveryKey,
  sha256Hex,
} from './sync/crypto.js'

const payload = { name: 'Diário.md', body: '# Título\n\nTexto com acentuação e 😀', pinned: true }

test('a note round-trips and the server only sees an opaque envelope', async () => {
  const key = generateKeyBytes()
  const { envelope, hash } = await encryptNote(key, 'n1', payload)
  assert.match(envelope, /^[A-Za-z0-9_-]+$/)
  assert.ok(!envelope.includes('Diário') && !envelope.includes('Título'))
  assert.equal(hash, await sha256Hex(envelope))
  assert.deepEqual(await decryptNote(key, 'n1', envelope), payload)
  // A fresh IV each time: the same note never produces the same envelope.
  assert.notEqual((await encryptNote(key, 'n1', payload)).envelope, envelope)
})

test('wrong key, another note id or a changed envelope are rejected', async () => {
  const key = generateKeyBytes()
  const { envelope } = await encryptNote(key, 'n1', payload)
  await assert.rejects(decryptNote(generateKeyBytes(), 'n1', envelope))
  await assert.rejects(decryptNote(key, 'n2', envelope))
  const flipped = envelope.slice(0, 20) + (envelope[20] === 'A' ? 'B' : 'A') + envelope.slice(21)
  await assert.rejects(decryptNote(key, 'n1', flipped))
  await assert.rejects(decryptNote(key, 'n1', 'not base64!'))
})

test('blobs are addressed by the envelope hash, not the image hash', async () => {
  const key = generateKeyBytes()
  const image = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
  const { bytes, sha256 } = await encryptBlob(key, 'img1', image)
  assert.notEqual(sha256, await sha256Hex(image))
  assert.deepEqual(await decryptBlob(key, 'img1', bytes, sha256), image)
  await assert.rejects(decryptBlob(key, 'img2', bytes, sha256))
  await assert.rejects(decryptBlob(key, 'img1', bytes, 'f'.repeat(64)))
})

test('the recovery key restores the same key and catches typos', async () => {
  const key = generateKeyBytes()
  const text = await recoveryKey(key)
  assert.match(text, /^([0-9A-HJKMNP-TV-Z]{5}-){10}[0-9A-HJKMNP-TV-Z]{5}$/)
  assert.deepEqual(await keyFromRecovery(text), key)
  assert.deepEqual(await keyFromRecovery(` ${text.toLowerCase().replace(/-/g, ' ')} `), key)
  const typo = text.slice(0, 3) + (text[3] === 'X' ? 'Y' : 'X') + text.slice(4)
  assert.equal(await keyFromRecovery(typo), null)
  assert.equal(await keyFromRecovery(text.slice(0, -5)), null)
  assert.equal(await keyFromRecovery('!!!'), null)
})
