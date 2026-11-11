import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { formattingContext, taskLineEdit } from './mobile/formatting-context.js'

const stateOf = (text, cursor = text.length) =>
  EditorState.create({ doc: text, selection: { anchor: cursor } })

test('the bar follows the cursor context', () => {
  const body =
    '# Título\n\n## Seção\n\nTexto comum\n\n- Item\n\n- [ ] Tarefa\n\n```js\nconst a = 1\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'
  assert.equal(formattingContext(stateOf(body, 2)), 'text') // title line
  assert.equal(formattingContext(stateOf(body, 14)), 'heading')
  assert.equal(formattingContext(stateOf(body, 25)), 'text')
  assert.equal(formattingContext(stateOf(body, 34)), 'list')
  assert.equal(formattingContext(stateOf(body, 42)), 'list')
  assert.equal(formattingContext(stateOf(body, 63)), 'code')
  assert.equal(formattingContext(stateOf(body, 80)), 'table')
})

test('a selection wins over the line groups, except inside code', () => {
  const body = 'Texto\n\n- Item\n\n```js\nconst a = 1\n```'
  const selected = (text, from, to) =>
    EditorState.create({ doc: text, selection: { anchor: from, head: to } })
  assert.equal(formattingContext(selected(body, 0, 5)), 'selection')
  assert.equal(formattingContext(selected(body, 7, 12)), 'selection')
  assert.equal(formattingContext(selected(body, 21, 31)), 'code')
})

test('the task edit converts a list item and flips the box', () => {
  const doc = stateOf('# Título\n\n- Comprar\n\n- [ ] Ler\n\n- [x] Andar').doc
  const convert = taskLineEdit(doc, 14)
  assert.deepEqual(
    { from: convert.from, to: convert.to, insert: convert.insert },
    { from: 12, to: 12, insert: '[ ] ' },
  )
  const flip = taskLineEdit(doc, 24)
  assert.deepEqual(
    { from: flip.from, to: flip.to, insert: flip.insert },
    { from: 24, to: 25, insert: 'x' },
  )
  const done = taskLineEdit(doc, 36)
  assert.deepEqual(
    { from: done.from, to: done.to, insert: done.insert },
    { from: 35, to: 36, insert: ' ' },
  )
})

test('the task edit refuses lines that are not list items', () => {
  const doc = stateOf('# Título\n\nTexto').doc
  assert.equal(taskLineEdit(doc, 0), null)
  assert.equal(taskLineEdit(doc, 12), null)
})
