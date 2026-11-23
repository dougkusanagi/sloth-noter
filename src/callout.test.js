import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calloutTemplate, readCallout, remarkCallouts } from './callout.js'
import { markdownTree } from './markdown-model.js'
import { blockEdit } from './insert-block.js'

test('recognizes supported blockquotes and leaves code and unknown markers as written', () => {
  const text = '# Nota\n\n> [!tip] Título\n> Corpo\n\n> [!UNKNOWN]\n\n```md\n> [!CAUTION]\n```'
  const alerts = markdownTree(text)
    .children.map((node) => readCallout(text, node))
    .filter(Boolean)
  assert.deepEqual(alerts, [{ type: 'tip', first: 3, last: 4, prefix: 9, title: 'Título' }])
})

test('reading keeps rich text and quoted blank lines after a custom title', () => {
  const text = '> [!WARNING] Antes de enviar\n> **Revise** o arquivo.\n>\n> - Anexos\n> - Links'
  const tree = structuredClone(markdownTree(text))
  remarkCallouts()(tree, text)
  const [alert] = tree.children
  assert.equal(alert.data.hProperties['data-callout'], 'warning')
  assert.equal(alert.children[0].children[0].value, 'Antes de enviar')
  assert.equal(alert.children[1].children[0].type, 'strong')
  assert.equal(alert.children[2].type, 'list')
})

test('inserting between quotes keeps the selection and the surrounding blocks', () => {
  const text = '# Nota\n\n> Antes\nTexto\n> Depois'
  const start = text.indexOf('Texto')
  const end = start + 'Texto'.length
  const edit = blockEdit(text, start, end, 'callout-note')
  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
  assert.equal(next, '# Nota\n\n> Antes\n\n> [!NOTE]\n> Texto\n\n> Depois')
  assert.equal(next.slice(edit.selectionFrom, edit.selectionTo), 'Texto')
  assert.equal(calloutTemplate('tip', 'Um\n\nDois'), '> [!TIP]\n> Um\n>\n> Dois')
})
