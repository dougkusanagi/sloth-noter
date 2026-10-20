import test from 'node:test'
import assert from 'node:assert/strict'
import { ChangeSet, Text } from '@codemirror/state'
import { documentChanges, mapSearchScope } from './search-scope.js'
import { findMatches } from './find.js'

test('scope follows edits before, inside and after it and maps back on undo', () => {
  const scope = { from: 5, to: 12 }
  const before = 'aaaa item item zzzz'
  const changes = ChangeSet.of(
    [
      { from: 0, insert: 'prefix ' },
      { from: 5, to: 9, insert: 'produto' },
      { from: 17, insert: 'end' },
    ],
    before.length,
  )
  const mapped = mapSearchScope(scope, changes)
  assert.deepEqual(mapped, { from: 12, to: 22 })
  assert.deepEqual(mapSearchScope(mapped, changes.invert(Text.of(before.split('\n')))), scope)
})

test('plain textarea edits map a selected range including boundary insertions and deletion', () => {
  assert.deepEqual(mapSearchScope({ from: 2, to: 6 }, documentChanges('aaitembb', 'aaproductbb')), {
    from: 2,
    to: 9,
  })
  assert.deepEqual(mapSearchScope({ from: 2, to: 6 }, documentChanges('aaitembb', 'aabb')), {
    from: 2,
    to: 2,
  })
})

test('selection search never falls back to the full document and starts matching at its boundary', () => {
  assert.deepEqual(findMatches('item item', 'item', { selectionOnly: true }), [])
  assert.deepEqual(
    findMatches('item item', 'item', { selectionOnly: true, scope: { from: 0, to: 0 } }),
    [],
  )
  assert.deepEqual(findMatches('aaaa', 'aa', { selectionOnly: true, scope: { from: 1, to: 4 } }), [
    { start: 1, end: 3 },
  ])
})
