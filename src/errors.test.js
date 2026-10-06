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

test('image deletion errors name the notes that still reference the image', () => {
  setLanguage('pt-BR')
  assert.equal(
    friendlyError('[image-in-use] Fotos.md, Trabalho.md'),
    'A imagem ainda é usada em: Fotos.md, Trabalho.md. Remova essas referências antes de excluir.',
  )
  setLanguage('en')
  assert.match(friendlyError('[image-in-use] Photos.md'), /still used in: Photos.md/)
  setLanguage('pt-BR')
})
