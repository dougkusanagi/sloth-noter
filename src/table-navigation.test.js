import test from 'node:test'
import assert from 'node:assert/strict'
import {
  tableAddColumn,
  tableAddRow,
  tableCellRange,
  tableInsertColumn,
  tableInsertRow,
  tableLineIndex,
  tableMoveTarget,
  tableRemoveColumn,
  tableRemoveRow,
} from './table-navigation.js'

test('moves between table cells and creates rows at the last body row', () => {
  assert.deepEqual(tableMoveTarget('enter', 1, 1, 2, 3), { type: 'move', row: 2, column: 1 })
  assert.deepEqual(tableMoveTarget('enter', 2, 1, 2, 3), { type: 'add-row', row: 3, column: 1 })
  assert.deepEqual(tableMoveTarget('enter', 0, 0, 0, 2), { type: 'add-row', row: 1, column: 0 })
  assert.deepEqual(tableMoveTarget('shift-enter', 1, 0, 2, 3), { type: 'move', row: 0, column: 0 })
})

test('moves horizontally and creates a column after the last cell', () => {
  assert.deepEqual(tableMoveTarget('tab', 1, 0, 2, 2), { type: 'move', row: 1, column: 1 })
  assert.deepEqual(tableMoveTarget('tab', 1, 1, 2, 2), { type: 'add-column', row: 1, column: 2 })
  assert.deepEqual(tableMoveTarget('shift-tab', 1, 0, 2, 2), { type: 'move', row: 0, column: 1 })
  assert.deepEqual(tableMoveTarget('home', 1, 1, 2, 2), { type: 'move', row: 1, column: 0 })
  assert.deepEqual(tableMoveTarget('end', 1, 0, 2, 2), { type: 'move', row: 1, column: 1 })
})

test('serializes added rows and columns as valid Markdown table lines', () => {
  const lines = ['| A | B |', '| --- | --- |', '| 1 | 2 |']
  assert.deepEqual(tableAddRow(lines, 2), [...lines, '|  |  |'])
  assert.deepEqual(tableAddColumn(lines), ['| A | B |  |', '| --- | --- | --- |', '| 1 | 2 |  |'])
})

test('inserts rows and columns at a requested position', () => {
  const lines = ['| A | B |', '| --- | --- |', '| 1 | 2 |']
  assert.deepEqual(tableInsertRow(lines, 1, 2), [
    '| A | B |',
    '| --- | --- |',
    '|  |  |',
    '| 1 | 2 |',
  ])
  assert.deepEqual(tableInsertColumn(lines, 1), [
    '| A |  | B |',
    '| --- | --- | --- |',
    '| 1 |  | 2 |',
  ])
})

test('removes table rows and columns while keeping valid lines', () => {
  const lines = ['| A | B | C |', '| --- | :---: | ---: |', '| 1 | 2 | 3 |']
  assert.deepEqual(tableRemoveRow(lines, 2), ['| A | B | C |', '| --- | :---: | ---: |'])
  assert.deepEqual(tableRemoveColumn(lines, 1), ['| A | C |', '| --- | ---: |', '| 1 | 3 |'])
})

test('maps a table cell range to document offsets', () => {
  const lines = ['| A | B |', '| --- | --- |', '| 1 | 2 |']
  assert.equal(tableLineIndex(0), 0)
  assert.equal(tableLineIndex(1), 2)
  assert.deepEqual(tableCellRange(lines, 2, 1, '\n', 100), { from: 130, to: 131 })
})
