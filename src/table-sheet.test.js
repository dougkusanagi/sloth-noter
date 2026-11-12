import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeCell,
  encodeCell,
  parseTsv,
  rangeCells,
  tableClearCells,
  tableToggleCellsWrap,
  tableValues,
  tableWriteCells,
  toTsv,
} from './table-sheet.js'

const lines = ['| A | B |', '| --- | --- |', '| 1 | 2 |']

test('cells decode to editable text and encode back to one Markdown line', () => {
  assert.equal(decodeCell('- [ ] a<br>- [x] b \\| c'), '- [ ] a\n- [x] b | c')
  assert.equal(encodeCell('- [ ] a\n- [x] b | c'), '- [ ] a<br>- [x] b \\| c')
  assert.equal(encodeCell('a||b'), 'a\\|\\|b')
  assert.equal(encodeCell('x \\| y'), 'x \\| y')
  assert.equal(encodeCell('  texto  \r\n'), 'texto')
})

test('writing cells grows the table when needed', () => {
  assert.deepEqual(tableWriteCells(lines, 1, 1, [['9']]), [
    '| A | B |',
    '| --- | --- |',
    '| 1 | 9 |',
  ])
  const grown = tableWriteCells(lines, 1, 1, [
    ['x', 'y'],
    ['z', ''],
  ])
  assert.deepEqual(tableValues(grown), [
    ['A', 'B', ''],
    ['1', 'x', 'y'],
    ['', 'z', ''],
  ])
  assert.equal(grown[1], '| --- | --- | --- |')
})

test('clearing and wrapping act on every cell of a range', () => {
  const range = { anchor: { row: 1, column: 0 }, head: { row: 0, column: 1 } }
  assert.deepEqual(rangeCells(range).length, 4)
  assert.deepEqual(tableValues(tableClearCells(lines, range)), [
    ['', ''],
    ['', ''],
  ])
  const bold = tableToggleCellsWrap(lines, range, '**')
  assert.deepEqual(tableValues(bold), [
    ['**A**', '**B**'],
    ['**1**', '**2**'],
  ])
  assert.deepEqual(tableValues(tableToggleCellsWrap(bold, range, '**')), tableValues(lines))
  const tasks = ['| A |', '| --- |', '| - [ ] um<br>- [x] dois |']
  const one = { anchor: { row: 1, column: 0 }, head: { row: 1, column: 0 } }
  assert.deepEqual(tableValues(tableToggleCellsWrap(tasks, one, '**'))[1], [
    '- [ ] **um**<br>- [x] **dois**',
  ])
})

test('TSV round trips quotes, tabs and line breaks', () => {
  const rows = [
    ['a', 'b\tc'],
    ['linha\nnova', 'diz "oi"'],
  ]
  assert.deepEqual(parseTsv(toTsv(rows)), rows)
  assert.deepEqual(parseTsv('1\t2\n3\t4\n'), [
    ['1', '2'],
    ['3', '4'],
  ])
  assert.deepEqual(parseTsv('só um'), [['só um']])
})
