import test from 'node:test'
import assert from 'node:assert/strict'
import { blockTemplate } from './insert-block.js'

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
