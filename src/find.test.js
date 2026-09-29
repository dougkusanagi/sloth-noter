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
