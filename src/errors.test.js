import test from 'node:test'
import assert from 'node:assert/strict'
import { friendlyError } from './errors.js'
import { setLanguage } from './i18n.js'

test('coded disk failures are explained in the interface language', () => {
  setLanguage('en')
  assert.match(friendlyError('[disk-full] No space left on device (os error 28)'), /disk is full/)
  setLanguage('pt-BR')
  assert.match(friendlyError('[denied] Permission denied (os error 13)'), /permissão/)
})

test('unknown codes and plain messages keep the original text', () => {
  assert.equal(friendlyError('[odd] something'), 'something')
  assert.equal(friendlyError('plain failure'), 'plain failure')
  assert.equal(friendlyError(new Error('boom')), 'boom')
  assert.equal(friendlyError(undefined), 'Storage is unavailable')
})
