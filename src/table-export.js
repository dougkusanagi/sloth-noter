import { applyDocumentColors } from './document-colors.js'
import { zipSync, strToU8 } from 'fflate'
import { markdownTree } from './markdown-model.js'

// Spreadsheet cells are text: keep identifiers, leading zeros and formula-like text intact.
function text(node) {
  if (node.type === 'html' && /^<br\s*\/?\s*>$/i.test(node.value)) return '\n'
  if (node.type === 'break') return '\n'
  if (node.type === 'image') return node.alt ?? ''
  return node.value ?? (node.children ?? []).map(text).join('')
}
export function spreadsheetRows(source) {
  const table = applyDocumentColors(structuredClone(markdownTree(source))).children.find(
    (node) => node.type === 'table',
  )
  return table?.children.map((row) => row.children.map(text)) ?? []
}
export function tableCsv(rows) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            // Quoting alone does not prevent Excel from evaluating CSV formulas.
            const safe = /^[\s]*[=+@-]/u.test(value) ? "'" + value : value
            return '"' + safe.replaceAll('"', '""') + '"'
          })
          .join(';'),
      )
      .join('\r\n') +
    '\r\n'
  )
}
const xml = (value) =>
  String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const column = (index) => {
  let name = ''
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}
export function tableXlsx(rows) {
  if (
    rows.length > 1048576 ||
    rows.some((row) => row.length > 16384 || row.some((cell) => cell.length > 32767))
  )
    throw new Error('spreadsheet-limit')
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const sheet = `<worksheet xmlns="${ns}"><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
  const files = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Tabela" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': sheet,
  }
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        name,
        strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + value),
      ]),
    ),
  )
}
