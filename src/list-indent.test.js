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
  assert.equal(run('1. a\n2. b', 9), '1. a\n    1. b')
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
  // Markdown lazy continuations belong to the item and follow its indentation.
  assert.equal(run('- a\n- b\ntexto\n- c', 4, 17), '- a\n    - b\n    texto\n- c')
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
  const lazy = '- a\ntexto\n- b'
  assert.equal(run(lazy, lazy.indexOf('- b')), '- a\ntexto\n    - b')
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

test('moving a parent carries its descendants and continuation paragraphs exactly once', () => {
  const text = '- anterior\n- pai\n    continuação\n    - filho\n        - neto\n- próximo'
  const nested =
    '- anterior\n    - pai\n        continuação\n        - filho\n            - neto\n- próximo'
  const at = text.indexOf('pai')
  assert.equal(run(text, at), nested)
  assert.equal(run(text, at, text.indexOf('- próximo')), nested)
  assert.equal(run(nested, nested.indexOf('pai'), undefined, true), text)
})

test('moving a numbered parent keeps child numbering and fenced code intact', () => {
  const text = '1. anterior\n2. pai\n    1. filho\n\n    ```\n    literal\n    ```\n3. próximo'
  const nested =
    '1. anterior\n    1. pai\n        1. filho\n\n        ```\n        literal\n        ```\n3. próximo'
  assert.equal(run(text, text.indexOf('pai')), nested)
  assert.equal(run('- pai\n    - filho', 2), '- pai\n    - filho')
})

test('the first item of a new numbered sublist restarts at 1', () => {
  assert.equal(run('1. a\n2. b', 9), '1. a\n    1. b')
  assert.equal(run('1. a\n7) b', 9), '1. a\n    1) b')
  assert.equal(run('1. a\n2. b\n3. c', 9), '1. a\n    1. b\n3. c')
  // A sibling already exists at that level, so the number stays.
  assert.equal(run('1. a\n    1. x\n2. y', 17), '1. a\n    1. x\n    2. y')
  // Bullets are not numbered.
  assert.equal(run('- a\n- b', 7), '- a\n    - b')
})

test('renumbering follows a moved selection and keeps the cursor with its text', () => {
  const text = '1. a\n2. b\n3. c'
  const changes = listIndentChanges(text, 5, 15)
  assert.equal(applyChanges(text, changes), '1. a\n    1. b\n    3. c')
  assert.equal(mapPosition(10, changes), 18)
})

test('Shift+Tab removes one quote level around lists without losing their markers', () => {
  const text = '> - 1. Comprar\n> - 2. Finalizar'
  assert.equal(run(text, 0, text.length, true), '- 1. Comprar\n- 2. Finalizar')
  assert.equal(run('> > - item', 8, 8, true), '> - item')
  assert.equal(run('  > 1. item', 8, 8, true), '1. item')
  assert.equal(listIndentChanges('```\n> - literal\n```', 8, 8, true), null)
  assert.equal(run('> texto', 5, 5, true), 'texto')
})
