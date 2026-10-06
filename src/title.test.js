import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { ensureTitle, mandatoryTitle, titlePosition, titleNavigationTarget } from './title.js'
test('first line always has exactly one H1 marker and remaining Markdown is preserved', () => {
  assert.equal(ensureTitle('Título\n\n## Corpo'), '# Título\n\n## Corpo')
  assert.equal(ensureTitle('## Título\ntexto'), '# Título\ntexto')
  assert.equal(ensureTitle('#Título'), '# Título')
  assert.equal(ensureTitle(''), '# ')
})
test('editor restores removed prefix in the same transaction and preserves the title cursor', () => {
  let state = EditorState.create({ doc: '# Título\nCorpo', extensions: [mandatoryTitle] })
  state = state.update({ changes: { from: 0, to: 2, insert: '' }, selection: { anchor: 0 } }).state
  assert.equal(state.doc.toString(), '# Título\nCorpo')
  assert.equal(state.selection.main.head, 2)
  state = state.update({
    changes: { from: 0, to: state.doc.length, insert: 'Novo\nCorpo' },
    selection: { anchor: 4 },
  }).state
  assert.equal(state.doc.toString(), '# Novo\nCorpo')
  assert.equal(state.selection.main.head, 6)
})

test('all selections exclude the prefix and the title can be erased without restricting cursor movement', () => {
  let state = EditorState.create({ doc: '# Meu título\n\nCorpo', extensions: [mandatoryTitle] })
  state = state.update({ selection: { anchor: 0, head: state.doc.length } }).state
  assert.equal(state.selection.main.from, 2)
  state = state.update({ changes: { from: 2, to: 12, insert: '' }, selection: { anchor: 2 } }).state
  assert.equal(state.doc.line(1).text, '# ')
  state = state.update({ selection: { anchor: state.doc.length } }).state
  assert.equal(state.selection.main.head, state.doc.length)
  assert.equal(ensureTitle('#   \nCorpo', 'Anterior'), '# Anterior\nCorpo')
  assert.equal(ensureTitle('# Meu '), '# Meu ')
})

test('blank lines below the title can be removed and inserted freely', () => {
  let state = EditorState.create({ doc: '# Título\n\n## Corpo', extensions: [mandatoryTitle] })
  state = state.update({ changes: { from: 8, to: 9, insert: '' }, selection: { anchor: 9 } }).state
  assert.equal(state.doc.toString(), '# Título\n## Corpo')
  assert.equal(state.selection.main.head, 9)
  state = state.update({ changes: { from: 9, insert: '\n\n' }, selection: { anchor: 11 } }).state
  assert.equal(state.doc.toString(), '# Título\n\n\n## Corpo')
  assert.equal(state.selection.main.head, 11)
  state = state.update({
    changes: { from: 0, to: state.doc.length, insert: 'Novo' },
    selection: { anchor: 4 },
  }).state
  assert.equal(state.doc.toString(), '# Novo')
  assert.equal(state.selection.main.head, 6)
})

test('title navigation enters the next line and returns from anywhere in the body', () => {
  const body = '# Título\n\n## Corpo'
  assert.equal(titleNavigationTarget(body, 2), 9)
  assert.equal(titleNavigationTarget(body, 8), 9)
  assert.equal(titleNavigationTarget(body, body.length, true), 8)
  assert.equal(titleNavigationTarget(body, 10), null)
  assert.equal(titleNavigationTarget(body, 2, true), null)
  assert.equal(titlePosition('Novo', '# Novo', 4), 6)
  assert.equal(titleNavigationTarget('# Título', 8), 9)
  assert.equal(titlePosition('T\nCorpo', '# T\nCorpo', 2), 4)
})
