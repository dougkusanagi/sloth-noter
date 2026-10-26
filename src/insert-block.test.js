import test from 'node:test'
import assert from 'node:assert/strict'
import { blockEdit, blockTemplate } from './insert-block.js'

const apply = (text, from, to, action) => {
  const edit = blockEdit(text, from, to, action)
  return {
    text: text.slice(0, edit.from) + edit.insert + text.slice(edit.to),
    from: edit.selectionFrom,
    to: edit.selectionTo,
  }
}

test('block commands preserve the mandatory title and existing content', () => {
  for (const action of ['h2', 'h3', 'h4', 'numbered', 'table', 'code']) {
    const result = apply('# Título\n\nTexto intacto', 2, 8, action)
    assert.ok(result.text.startsWith('# Título\n\n'))
    assert.ok(result.text.endsWith('Texto intacto'))
    assert.ok(result.from >= '# Título\n\n'.length)
  }
})

test('heading levels replace existing markers and toggle off without losing the selection', () => {
  const text = '# Título\n\n## ação 日本語'
  const changed = apply(text, 13, text.length, 'h3')
  assert.equal(changed.text, '# Título\n\n### ação 日本語')
  assert.equal(changed.text.slice(changed.from, changed.to), 'ação 日本語')
  const plain = apply(changed.text, changed.from, changed.to, 'h3')
  assert.equal(plain.text, '# Título\n\nação 日本語')
})

test('a selection ending at the next line does not include that line in the heading', () => {
  const text = '# Título\n\nUma linha\nOutra'
  const result = apply(text, 10, text.indexOf('Outra'), 'h4')
  assert.equal(result.text, '# Título\n\n#### Uma linha\nOutra')
  assert.ok(Number.isInteger(result.to))
})

test('tables preserve selected paragraph text and code blocks wrap it', () => {
  const text = '# Título\n\nTexto selecionado'
  const table = apply(text, 10, text.length, 'table')
  assert.ok(table.text.endsWith('\n\nTexto selecionado'))
  assert.equal(table.text.slice(table.from, table.to), 'Coluna 1')
  const code = apply(text, 10, text.length, 'code')
  assert.equal(code.text, '# Título\n\n```\nTexto selecionado\n```')
  assert.equal(code.text.slice(code.from, code.to), 'Texto selecionado')
})

test('offers editable headings, lists, tables and code blocks', () => {
  assert.deepEqual(blockTemplate('h4'), { text: '#### ', selectionFrom: 5, selectionTo: 5 })
  assert.deepEqual(blockTemplate('table'), {
    text: '| Coluna 1 | Coluna 2 |\n| --- | --- |\n| Valor 1 | Valor 2 |',
    selectionFrom: 2,
    selectionTo: 10,
  })
  assert.deepEqual(blockTemplate('code'), { text: '```\n\n```', selectionFrom: 4, selectionTo: 4 })
  assert.equal(blockTemplate('other'), null)
})
