import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync, strFromU8 } from 'fflate'
import { spreadsheetRows, tableCsv, tableXlsx } from './table-export.js'

test('spreadsheet export parses Markdown cells without formatting markers', () => {
  assert.deepEqual(
    spreadsheetRows(
      '| Nome | Código |\n| --- | --- |\n| **José** & [site](https://example.com) | 001 |',
    ),
    [
      ['Nome', 'Código'],
      ['José & site', '001'],
    ],
  )
})
test('CSV quotes delimiters and line breaks, preserves accents and neutralizes formulas', () => {
  assert.equal(
    tableCsv([['São; Paulo', 'a"b', 'a\nb', '=1+1', '001']]),
    '\uFEFF"São; Paulo";"a""b";"a\nb";"\'=1+1";"001"\r\n',
  )
})
test('XLSX contains a connected workbook with inline text, XML escapes and Excel column names', () => {
  const files = unzipSync(
    tableXlsx([Array.from({ length: 28 }, (_, i) => (i === 0 ? '=1+1 & <teste>' : '001'))]),
  )
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
  assert.match(sheet, /r="AB1" t="inlineStr"/)
  assert.match(sheet, /=1\+1 &amp; &lt;teste&gt;/)
  assert.doesNotMatch(sheet, /<f>/)
  assert.match(strFromU8(files['xl/_rels/workbook.xml.rels']), /worksheets\/sheet1.xml/)
  assert.throws(() => tableXlsx([['a'.repeat(32768)]]), /spreadsheet-limit/)
})

test('export converts cell breaks to newlines without changing code spans', () => {
  assert.deepEqual(spreadsheetRows('| A |\n| --- |\n| Item<br>Outro e `<br>` |'), [
    ['A'],
    ['Item\nOutro e <br>'],
  ])
})

test('spreadsheet export includes colored text without its HTML delimiters', () => {
  assert.deepEqual(
    spreadsheetRows('| Nome |\n| --- |\n| <span style="color:#e76565">Item</span> |'),
    [['Nome'], ['Item']],
  )
})
