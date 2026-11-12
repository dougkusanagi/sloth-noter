import { parseTableLine, tableCellAtColumn } from './markdown-table.js'

export function tableMoveTarget(action, row, column, bodyRows, columnCount) {
  const rowCount = bodyRows + 1
  if (action === 'enter') {
    if (row === 0 && bodyRows === 0) return { type: 'add-row', row: rowCount, column }
    if (row < bodyRows) return { type: 'move', row: row + 1, column }
    return { type: 'add-row', row: rowCount, column }
  }
  if (action === 'shift-enter') {
    if (row > 1) return { type: 'move', row: row - 1, column }
    if (row === 1) return { type: 'move', row: 0, column }
    return null
  }
  if (action === 'tab') {
    return column < columnCount - 1
      ? { type: 'move', row, column: column + 1 }
      : { type: 'add-column', row, column: columnCount }
  }
  if (action === 'shift-tab') {
    if (column > 0) return { type: 'move', row, column: column - 1 }
    if (row > 0) return { type: 'move', row: row - 1, column: columnCount - 1 }
    return null
  }
  if (action === 'up') return row > 0 ? { type: 'move', row: row - 1, column } : null
  if (action === 'down') return row < bodyRows ? { type: 'move', row: row + 1, column } : null
  if (action === 'home') return { type: 'move', row, column: 0 }
  if (action === 'end') return { type: 'move', row, column: columnCount - 1 }
  return null
}

export function tableLineIndex(row) {
  return row === 0 ? 0 : row + 1
}

export function tableBlankRow(columnCount) {
  return `|${Array.from({ length: columnCount }, () => ' ').join(' | ')}|`
}

export function tableAppendColumn(line, divider = false) {
  const parsed = parseTableLine(line)
  if (!parsed) return line
  const before = line.slice(0, parsed.end - 1).trimEnd()
  const suffix = line.slice(parsed.end)
  return `${before} |${divider ? ' --- ' : '  '}|${suffix}`
}

export function tableAddRow(lines, columnCount) {
  return [...lines, tableBlankRow(columnCount)]
}

export function tableAddColumn(lines) {
  return lines.map((line, index) => tableAppendColumn(line, index === 1))
}

export function tableInsertRow(lines, lineIndex, columnCount) {
  return [
    ...lines.slice(0, lineIndex + 1),
    tableBlankRow(columnCount),
    ...lines.slice(lineIndex + 1),
  ]
}

export function tableInsertColumn(lines, column) {
  return lines.map((line, index) => {
    const parsed = parseTableLine(line)
    if (!parsed) return line
    const values = parsed.cells.map((cell) => cell.value)
    values.splice(Math.max(0, Math.min(column, values.length)), 0, index === 1 ? '---' : '')
    return `| ${values.join(' | ')} |`
  })
}

export function tableRemoveRow(lines, lineIndex) {
  return lines.filter((_, index) => index !== lineIndex)
}

export function tableRemoveColumn(lines, column) {
  return lines.map((line) => {
    const parsed = parseTableLine(line)
    if (!parsed) return line
    const values = parsed.cells.filter((cell) => cell.index !== column).map((cell) => cell.value)
    return `| ${values.join(' | ')} |`
  })
}

export function tableCellRange(lines, row, column, lineBreak, from = 0) {
  if (!lines[row]) return null
  let position = from
  for (let index = 0; index < row; index++) position += lines[index].length + lineBreak.length
  const parsed = parseTableLine(lines[row])
  if (!parsed) return null
  const cell = tableCellAtColumn(parsed, column)
  return { from: position + cell.from, to: position + cell.to }
}

const wrapped = (value, marker) =>
  value.length >= marker.length * 2 && value.startsWith(marker) && value.endsWith(marker)

function axisCells(lines, row, column) {
  return lines.flatMap((line, index) => {
    if (index === 1 || (row != null && row !== index)) return []
    return (parseTableLine(line)?.cells ?? []).filter(
      (cell) => (column == null || cell.index === column) && cell.value.trim(),
    )
  })
}

// True when every filled cell of a row (line index) or column already uses the marker.
export function tableAxisWrapped(lines, row, column, marker) {
  const cells = axisCells(lines, row, column)
  return cells.length > 0 && cells.every((cell) => wrapped(cell.value, marker))
}

// Formatting a row or column stays ordinary Markdown, including after export.
// Empty cells stay empty, and the divider line is never changed.
export function tableToggleWrap(lines, row, column, marker) {
  const remove = tableAxisWrapped(lines, row, column, marker)
  return lines.map((line, index) => {
    if (index === 1 || (row != null && row !== index)) return line
    let result = line
    for (const cell of [...(parseTableLine(line)?.cells ?? [])].reverse()) {
      if ((column != null && cell.index !== column) || !cell.value.trim()) continue
      const has = wrapped(cell.value, marker)
      const value = remove
        ? cell.value.slice(marker.length, -marker.length)
        : has
          ? cell.value
          : marker + cell.value + marker
      result = result.slice(0, cell.from) + value + result.slice(cell.to)
    }
    return result
  })
}

// The header emphasis is bold text, because Markdown has no header column.
export function tableToggleHeader(lines, row, column) {
  return tableToggleWrap(lines, row, column, '**')
}

// Sets a column alignment in the divider line; the same alignment again removes it.
export function tableSetAlignment(lines, column, align) {
  const divider = parseTableLine(lines[1] ?? '')
  const cell = divider?.cells.find((item) => item.index === column)
  if (!cell) return lines
  const value = cell.value.trim()
  const current =
    value.startsWith(':') && value.endsWith(':')
      ? 'center'
      : value.endsWith(':')
        ? 'right'
        : value.startsWith(':')
          ? 'left'
          : null
  const next =
    current === align ? '---' : ({ left: ':---', center: ':---:', right: '---:' }[align] ?? '---')
  const line = lines[1]
  return [lines[0], line.slice(0, cell.from) + next + line.slice(cell.to), ...lines.slice(2)]
}
