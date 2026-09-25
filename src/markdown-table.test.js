import test from 'node:test'
import assert from 'node:assert/strict'
import { isTableDivider, parseTableLine, tableCellAtColumn, tableCellAtOffset, tableGroup, tableGroupDetails } from './markdown-table.js'

test('parses Markdown table headers and rows', () => {
  const lines = ['| Nome | Tipo |', '| --- | :---: |', '| Nota | Texto |', 'Depois']
  assert.equal(isTableDivider(lines[1]), true)
  assert.deepEqual(tableGroup(lines, 0), { start: 0, end: 3, headers: ['Nome', 'Tipo'], rows: [['Nota', 'Texto']] })
})

test('keeps source positions and escaped pipes for editable cells', () => {
  const parsed = parseTableLine('| a \\| b | `x|y` |')
  assert.deepEqual(parsed.cells.map(cell => cell.value), ['a \\| b', '`x|y`'])
  assert.deepEqual(parsed.cells.map(cell => [cell.from, cell.to]), [[2, 8], [11, 16]])
  assert.equal(tableCellAtOffset(parsed, 4), 0)
  assert.equal(tableCellAtOffset(parsed, 12), 1)
  assert.equal(tableCellAtColumn(parsed, 2).value, '')
})

test('exposes table column count and parsed rows for navigation', () => {
  const group = tableGroupDetails(['| A | B |', '| --- | --- |', '| 1 |', '| 1 | 2 | 3 |'], 0)
  assert.equal(group.columnCount, 3)
  assert.equal(group.rows.length, 2)
  assert.deepEqual(group.rows[1].cells.map(cell => cell.value), ['1', '2', '3'])
})
