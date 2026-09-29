import test from 'node:test'
import assert from 'node:assert/strict'
import { LANGUAGES, messageKeys, setLanguage, t } from './i18n.js'

test('every language defines exactly the same messages', () => {
  const [first, ...others] = Object.keys(LANGUAGES)
  for (const lang of others) assert.deepEqual(messageKeys(lang).sort(), messageKeys(first).sort())
})

test('placeholders match across languages', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  for (const key of messageKeys('en'))
    assert.deepEqual(placeholders(t(key, {}, 'pt-BR')), placeholders(t(key, {}, 'en')), key)
})

test('placeholders and plural forms are resolved', () => {
  assert.equal(t('menu.trash', { count: 3 }, 'pt-BR'), 'Lixeira (3)')
  assert.equal(t('find.matches', { count: 1 }, 'en'), '1 match')
  assert.equal(t('find.matches', { count: 2 }, 'en'), '2 matches')
  assert.equal(t('find.matches', { count: 0 }, 'pt-BR'), '0 ocorrências')
})

test('unknown languages fall back to Portuguese and unknown keys to the key', () => {
  setLanguage('fr')
  assert.equal(t('menu.newNote'), 'Nova nota')
  setLanguage('en')
  assert.equal(t('menu.newNote'), 'New note')
  assert.equal(t('nope'), 'nope')
  setLanguage('pt-BR')
})
