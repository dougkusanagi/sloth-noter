import test from 'node:test'
import assert from 'node:assert/strict'
import { createTextCache } from './text-cache.js'
import { markdownTree } from './markdown-model.js'

test('the cache evicts least recently used text and accounts for replaced entries', () => {
  const cache = createTextCache({ maxEntries: 2, maxCharacters: 10 })
  cache.set('aaa', 1)
  cache.set('bbb', 2)
  assert.equal(cache.get('aaa'), 1)
  cache.set('ccc', 3)
  assert.equal(cache.get('bbb'), undefined)
  cache.set('aaa', 4)
  assert.equal(cache.characters, 6)
  assert.equal(cache.get('aaa'), 4)
})

test('the cache bounds total text volume while keeping an oversized current document reusable', () => {
  const cache = createTextCache({ maxCharacters: 5 })
  cache.set('aaa', 1)
  cache.set('bbb', 2)
  assert.equal(cache.size, 1)
  cache.set('large document', 3)
  assert.equal(cache.size, 1)
  assert.equal(cache.get('large document'), 3)
})

test('Markdown parsing reuses a current tree without retaining 128 old revisions', () => {
  const first = markdownTree('# Original')
  assert.equal(markdownTree('# Original'), first)
  for (let revision = 0; revision < 10; revision++) markdownTree(`# Revision ${revision}`)
  assert.notEqual(markdownTree('# Original'), first)
})
