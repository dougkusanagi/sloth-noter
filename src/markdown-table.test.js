import test from 'node:test'
import assert from 'node:assert/strict'
import { tableGroup, isTableDivider } from './markdown-table.js'

test('parses Markdown table headers and rows', () => {
  const lines = ['| Nome | Tipo |', '| --- | :---: |', '| Nota | Texto |', 'Depois']
  assert.equal(isTableDivider(lines[1]), true)
  assert.deepEqual(tableGroup(lines, 0), { start: 0, end: 3, headers: ['Nome', 'Tipo'], rows: [['Nota', 'Texto']] })
})
