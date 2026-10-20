import test from 'node:test'
import assert from 'node:assert/strict'
import { findMatches } from './find.js'

test('finds repeated text without shifting offsets after Unicode case changes', () => {
  assert.deepEqual(findMatches('İ x X', 'x'), [
    { start: 2, end: 3 },
    { start: 4, end: 5 },
  ])
})

test('treats search text literally and preserves selection length', () => {
  assert.deepEqual(findMatches('a.b a-b A.B', 'a.b'), [
    { start: 0, end: 3 },
    { start: 8, end: 11 },
  ])
  assert.deepEqual(findMatches('hello', ''), [])
})

test('ignores accents and retains UTF-16 source offsets including combining accents', () => {
  assert.deepEqual(findMatches('😀 inventário inventa\u0301rio INVENTARIO', 'inventario'), [
    { start: 3, end: 13 },
    { start: 14, end: 25 },
    { start: 26, end: 36 },
  ])
  assert.deepEqual(findMatches('café cafe\u0301', 'cafe'), [
    { start: 0, end: 4 },
    { start: 5, end: 10 },
  ])
})

test('case, Unicode whole words, regex errors and zero-width expressions', async () => {
  const { searchNote } = await import('./find.js')
  assert.equal(
    findMatches('Inventário inventário', 'inventario', { caseSensitive: true }).length,
    1,
  )
  assert.equal(findMatches('ação ações ação_extra (ação)', 'acao', { wholeWord: true }).length, 2)
  assert.equal(searchNote('abc', '[', { regex: true }).error, 'regex')
  assert.equal(findMatches('a a', '(?=a)', { regex: true }).length, 2)
  assert.equal(findMatches('inventário inventario', 'inventario', { regex: true }).length, 1)
})

test('regex replacements expand captures, dollar escapes and case preservation', async () => {
  const { replacementText } = await import('./find.js')
  const source = 'item-42'
  const match = findMatches(source, '(?<name>item)-(\\d+)', { regex: true })[0]
  assert.equal(
    replacementText(source, match, '$2/$<name>/$$/$&', { regex: true }),
    '42/item/$/item-42',
  )
  assert.equal(
    replacementText('TEST', { start: 0, end: 4 }, 'novo', { preserveCase: true }),
    'NOVO',
  )
})

test('selection boundaries limit matches without changing offsets', () => {
  assert.deepEqual(
    findMatches('one one one', 'one', { selectionOnly: true, scope: { from: 4, to: 7 } }),
    [{ start: 4, end: 7 }],
  )
})

test('regex replacement supports the full match and escaped line breaks', async () => {
  const { replacementText } = await import('./find.js')
  const match = findMatches('abc', 'abc', { regex: true })[0]
  assert.equal(replacementText('abc', match, '$0\\n\\t', { regex: true }), 'abc\n\t')
})

test('captured backslashes remain literal during replacement', async () => {
  const { replacementText } = await import('./find.js')
  const source = 'C:\\notes'
  const match = findMatches(source, '.+', { regex: true })[0]
  assert.equal(replacementText(source, match, '$0\\n', { regex: true }), source + '\n')
})
