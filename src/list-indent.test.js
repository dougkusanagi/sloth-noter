import test from 'node:test'
import assert from 'node:assert/strict'
import { INDENT, applyChanges, listIndentChanges, mapPosition } from './list-indent.js'

const run = (text, from, to = from, outdent = false) => {
  const changes = listIndentChanges(text, from, to, outdent)
  return changes && applyChanges(text, changes)
}

test('Tab nests a list item under the previous one with four spaces', () => {
  assert.equal(INDENT, '    ')
  assert.equal(run('- a\n- b', 7), '- a\n    - b')
  assert.equal(run('1. a\n2. b', 9), '1. a\n    2. b')
  assert.equal(run('- a\n- [ ] tarefa', 10), '- a\n    - [ ] tarefa')
  assert.equal(run('* a\n+ b', 7), '* a\n    + b')
  assert.equal(run('- a\n\n- b', 8), '- a\n\n    - b')
})

test('the first item and items already one level deeper stay put', () => {
  assert.deepEqual(listIndentChanges('- a\n- b', 2, 2), [])
  assert.deepEqual(listIndentChanges('- a\n    - b', 10, 10), [])
  assert.equal(run('- a\n    - b\n    - c', 18), '- a\n    - b\n        - c')
})

test('Shift+Tab removes up to four spaces or one tab and stops at the margin', () => {
  assert.equal(run('- a\n    - b', 10, 10, true), '- a\n- b')
  assert.equal(run('- a\n  - b', 8, 8, true), '- a\n- b')
  assert.equal(run('- a\n\t- b', 8, 8, true), '- a\n- b')
  assert.equal(run('- a\n        - b', 14, 14, true), '- a\n    - b')
  assert.deepEqual(listIndentChanges('- a', 1, 1, true), [])
})

test('a selection moves every list item it touches, keeping their shape', () => {
  const text = '- a\n- b\n    - c\n- d'
  assert.equal(run(text, 4, 17), '- a\n    - b\n        - c\n    - d')
  assert.equal(run('- a\n    - b\n        - c', 0, 21, true), '- a\n- b\n    - c')
  // A selection that ends at the start of a line does not touch that line.
  assert.equal(run('- a\n- b\n- c', 4, 8), '- a\n    - b\n- c')
  // Lines that are not list items are left alone.
  assert.equal(run('- a\n- b\ntexto\n- c', 4, 17), '- a\n    - b\ntexto\n- c')
})

test('Tab does nothing outside lists and inside code', () => {
  assert.equal(listIndentChanges('texto', 2, 2), null)
  assert.equal(listIndentChanges('# Título\n\ntexto', 12, 12), null)
  assert.equal(listIndentChanges('```\n- a\n- b\n```', 8, 8), null)
  assert.equal(listIndentChanges('1.texto', 2, 2), null)
  assert.equal(listIndentChanges('-texto', 2, 2), null)
})

test('a continuation paragraph does not hide the parent item', () => {
  assert.equal(run('- a\n    texto\n- b', 17), '- a\n    texto\n    - b')
})

test('positions follow the edits', () => {
  const text = '- a\n- b'
  const changes = listIndentChanges(text, 5, 5)
  assert.equal(mapPosition(2, changes), 2)
  assert.equal(mapPosition(4, changes), 8)
  assert.equal(mapPosition(5, changes), 9)
  const back = listIndentChanges('- a\n    - b', 10, 10, true)
  assert.equal(mapPosition(10, back), 6)
  assert.equal(mapPosition(5, back), 4)
})
