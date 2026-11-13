// Spreadsheet-style operations on the lines of a Markdown table. Rows are
// counted like the table shows them: row 0 is the header, row 1 the first body
// row (the divider line is skipped).
import { parseTableLine } from './markdown-table.js'
import { tableAppendColumn, tableBlankRow, tableLineIndex } from './table-navigation.js'

// The cell text as people edit it: real line breaks and plain pipes.
export function decodeCell(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/\\\|/g, '|')
}

// Back to Markdown: pipes escaped and line breaks as <br>, so the row stays one line.
export function encodeCell(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('<br>')
    .replace(/(^|[^\\])\|/g, '$1\\|')
    .replace(/(^|[^\\])\|/g, '$1\\|')
    .trim()
}

export function tableValues(lines) {
  return lines
    .filter((_, index) => index !== 1)
    .map((line) => (parseTableLine(line)?.cells ?? []).map((cell) => cell.value))
}

function setLineCell(line, column, value) {
  let next = line
  let parsed = parseTableLine(next)
  if (!parsed) return line
  while (parsed.cells.length <= column) {
    next = tableAppendColumn(next)
    parsed = parseTableLine(next)
  }
  const cell = parsed.cells[column]
  return next.slice(0, cell.rawFrom) + (value ? ` ${value} ` : '  ') + next.slice(cell.rawTo)
}

const columnCount = (lines) => parseTableLine(lines[0] ?? '')?.cells.length ?? 0

// Writes a block of already encoded values with its top-left corner at
// (row, column). The table grows with new rows and columns when the block
// goes past its edges.
export function tableWriteCells(lines, row, column, values) {
  let next = [...lines]
  const width = Math.max(0, ...values.map((items) => items.length))
  while (columnCount(next) < column + width)
    next = next.map((line, index) => tableAppendColumn(line, index === 1))
  values.forEach((items, offset) => {
    const lineIndex = tableLineIndex(row + offset)
    while (next.length <= lineIndex) next.push(tableBlankRow(columnCount(next)))
    items.forEach((value, index) => {
      next[lineIndex] = setLineCell(next[lineIndex], column + index, value)
    })
  })
  return next
}

export function normalizeRange(range) {
  return {
    top: Math.min(range.anchor.row, range.head.row),
    bottom: Math.max(range.anchor.row, range.head.row),
    left: Math.min(range.anchor.column, range.head.column),
    right: Math.max(range.anchor.column, range.head.column),
  }
}

export function rangeCells(range) {
  const { top, bottom, left, right } = normalizeRange(range)
  const cells = []
  for (let row = top; row <= bottom; row++)
    for (let column = left; column <= right; column++) cells.push([row, column])
  return cells
}

export function tableClearCells(lines, range) {
  const { top, bottom, left, right } = normalizeRange(range)
  return tableWriteCells(
    lines,
    top,
    left,
    Array.from({ length: bottom - top + 1 }, () =>
      Array.from({ length: right - left + 1 }, () => ''),
    ),
  )
}

const wrapped = (value, marker) =>
  value.length >= marker.length * 2 && value.startsWith(marker) && value.endsWith(marker)

// Wraps every filled cell of the range in a marker such as "**", or removes it
// when all of them already have it.
export function tableToggleCellsWrap(lines, range, marker) {
  const values = tableValues(lines)
  const { top, bottom, left, right } = normalizeRange(range)
  const filled = []
  for (let row = top; row <= bottom; row++)
    for (let column = left; column <= right; column++) {
      const value = values[row]?.[column] ?? ''
      if (value.trim()) filled.push([row, column, value])
    }
  if (!filled.length) return lines
  const remove = filled.every(([, , value]) => cellWrapped(value, marker))
  let next = lines
  for (const [row, column, value] of filled)
    next = tableWriteCells(next, row, column, [[wrapCell(value, marker, remove)]])
  return next
}

// True when every filled cell of the range already uses the marker.
export function tableCellsWrapped(lines, range, marker) {
  const values = tableValues(lines)
  const { top, bottom, left, right } = normalizeRange(range)
  const filled = []
  for (let row = top; row <= bottom; row++)
    for (let column = left; column <= right; column++) {
      const value = values[row]?.[column] ?? ''
      if (value.trim()) filled.push(value)
    }
  return filled.length > 0 && filled.every((value) => cellWrapped(value, marker))
}

// A cell can hold several lines (<br>) and list or task items: the marker goes
// around the text of each line, after its list or task marker.
const ITEM = /^(\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?)(.*)$/

function cellParts(value) {
  return value.split(/(<br\s*\/?\s*>)/i).map((part, index) => {
    if (index % 2) return { separator: part }
    const [, prefix, text] = ITEM.exec(part)
    return { prefix, text }
  })
}

function cellWrapped(value, marker) {
  const texts = cellParts(value).filter((part) => !part.separator && part.text.trim())
  return texts.length > 0 && texts.every((part) => wrapped(part.text.trim(), marker))
}

function wrapCell(value, marker, remove) {
  return cellParts(value)
    .map((part) => {
      if (part.separator) return part.separator
      const text = part.text.trim()
      if (!text) return part.prefix + part.text
      if (remove) return part.prefix + text.slice(marker.length, -marker.length)
      return part.prefix + (wrapped(text, marker) ? text : marker + text + marker)
    })
    .join('')
}

// Tab-separated text, as spreadsheets copy and paste it.
export function toTsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => (/[\t\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value))
        .join('\t'),
    )
    .join('\n')
}

export function parseTsv(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n')
  const rows = [[]]
  let value = ''
  let quoted = false
  let start = true
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"'
        index++
      } else if (character === '"') quoted = false
      else value += character
      continue
    }
    if (character === '"' && start) {
      quoted = true
      start = false
      continue
    }
    start = false
    if (character === '\t' || character === '\n') {
      rows.at(-1).push(value)
      value = ''
      start = true
      if (character === '\n') rows.push([])
    } else value += character
  }
  rows.at(-1).push(value)
  if (rows.length > 1 && rows.at(-1).length === 1 && rows.at(-1)[0] === '') rows.pop()
  return rows
}

// The cells the app itself copied, so a formula pasted into another cell can
// move its references as in a spreadsheet. Text from another app has no origin
// and pastes as it is.
let copiedCells = null

export function rememberCopiedCells(text, top, left) {
  copiedCells = { text, top, left }
}

export function copiedCellsOffset(text, top, left) {
  if (!copiedCells || copiedCells.text !== text) return null
  return { row: top - copiedCells.top, column: left - copiedCells.left }
}
