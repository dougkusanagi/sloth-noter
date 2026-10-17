import test from 'node:test'
import assert from 'node:assert/strict'
import { moveListItems } from './list-move.js'
import { applyChanges } from './list-indent.js'

const move = (text, at, direction, end = at) => {
  const result = moveListItems(text, at, end, direction)
  return result && applyChanges(text, result.changes)
}

test('moves items in both directions and keeps the cursor on their text', () => {
  const text = '# Lista\n\n- a\n- longo\n- c'
  const at = text.indexOf('longo') + 2
  const up = moveListItems(text, at, at, -1)
  const moved = applyChanges(text, up.changes)
  assert.equal(moved, '# Lista\n\n- longo\n- a\n- c')
  assert.equal(moved.slice(up.anchor - 2, up.head + 3), 'longo')
  assert.equal(move(moved, up.head, 1), text)
})

test('moves complete subtrees, continuation paragraphs, and checked tasks', () => {
  const text = '- [x] pai\n    - filho\n\n    continuação\n\n- [ ] outro'
  assert.equal(move(text, 8, 1), '- [ ] outro\n\n- [x] pai\n    - filho\n\n    continuação')
  const nested = '- pai\n    - um\n    - dois\n- outro'
  assert.equal(move(nested, nested.indexOf('dois'), -1), '- pai\n    - dois\n    - um\n- outro')
})

test('respects list boundaries and ignores paragraphs and code', () => {
  assert.deepEqual(moveListItems('- a\n- b', 2, 2, -1).changes, [])
  assert.deepEqual(moveListItems('- a\n- b', 6, 6, 1).changes, [])
  assert.equal(moveListItems('texto\n\n- a', 2, 2, 1), null)
  assert.equal(moveListItems('```\n- a\n- b\n```', 6, 6, 1), null)
  assert.equal(move('- a\n\nFim\n\n- b', 2, 1), '- a\n\nFim\n\n- b')
})

test('preserves ordered markers and quoted lists', () => {
  assert.equal(move('1. a\n2. b', 8, -1), '2. b\n1. a')
  assert.equal(move('> - a\n> - b', 10, -1), '> - b\n> - a')
})

test('moves a selection of siblings together and preserves reversed selection', () => {
  const text = '- a\n- b\n- c\n- d'
  assert.equal(move(text, 4, 1, 12), '- a\n- d\n- b\n- c')
  const down = moveListItems(text, 4, 12, 1)
  assert.ok(down.head <= text.length)
  const result = moveListItems(text, 11, 4, -1)
  assert.equal(applyChanges(text, result.changes), '- b\n- c\n- a\n- d')
  assert.equal(result.anchor - result.head, 7)
})
