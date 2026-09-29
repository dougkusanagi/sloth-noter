import { t } from '../i18n.js'
import { addInlineRangeDecorations } from './inline-decorations.js'
import { EditorSelection } from '@codemirror/state'
import { Decoration, WidgetType } from '@codemirror/view'
import {
  parseTableLine,
  tableCellAtColumn,
  tableCellAtOffset,
  tableCells,
  tableGroupDetails,
} from '../markdown-table.js'
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
} from '../table-navigation.js'

export const trashIconMarkup =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4M11.5 9v4" /></svg>'

export class TableCellWidget extends WidgetType {
  constructor({ from, to, column, columnCount, header, active }) {
    super()
    this.from = from
    this.to = to
    this.column = column
    this.columnCount = columnCount
    this.header = header
    this.active = active
  }
  eq(other) {
    return (
      this.from === other.from &&
      this.to === other.to &&
      this.column === other.column &&
      this.columnCount === other.columnCount &&
      this.header === other.header &&
      this.active === other.active
    )
  }
  get cellClass() {
    const edge = `${this.column === 0 ? ' cm-md-table-cell-first' : ''}${this.column === this.columnCount - 1 ? ' cm-md-table-cell-last' : ''}`
    return `cm-md-table-cell${edge}${this.active ? ' cm-md-table-cell-active' : ''}`
  }
  updateDOM(dom) {
    dom.className = this.cellClass
    dom.dataset.column = String(this.column)
    dom.dataset.cellFrom = String(this.from)
    dom.dataset.cellTo = String(this.to)
    dom.dataset.cellEmpty = this.from === this.to ? 'true' : 'false'
    dom.title = t('table.cellHint')
    return true
  }
  toDOM() {
    const cell = document.createElement('span')
    cell.className = this.cellClass
    cell.dataset.column = String(this.column)
    cell.dataset.cellFrom = String(this.from)
    cell.dataset.cellTo = String(this.to)
    cell.dataset.cellEmpty = this.from === this.to ? 'true' : 'false'
    cell.title = t('table.cellHint')
    cell.contentEditable = 'false'
    return cell
  }
  ignoreEvent() {
    return false
  }
}

export class TableRowControlWidget extends WidgetType {
  constructor({ tableFirst, row, removable }) {
    super()
    this.tableFirst = tableFirst
    this.row = row
    this.removable = removable
  }
  eq(other) {
    return (
      this.tableFirst === other.tableFirst &&
      this.row === other.row &&
      this.removable === other.removable
    )
  }
  toDOM(view) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-md-table-remove-row'
    button.innerHTML = trashIconMarkup
    button.title = this.removable ? t('table.removeRow') : t('table.needRow')
    button.setAttribute('aria-label', t('table.removeRow'))
    button.disabled = !this.removable
    const stop = (event) => {
      event.preventDefault()
      event.stopPropagation()
    }
    button.addEventListener('mousedown', stop)
    button.addEventListener('click', (event) => {
      stop(event)
      removeTableRowAt(view, this.tableFirst, this.row)
    })
    return button
  }
  ignoreEvent() {
    return false
  }
}

export class TableColumnControlsWidget extends WidgetType {
  constructor({ tableFirst, columnCount }) {
    super()
    this.tableFirst = tableFirst
    this.columnCount = columnCount
  }
  eq(other) {
    return this.tableFirst === other.tableFirst && this.columnCount === other.columnCount
  }
  toDOM(view) {
    const root = document.createElement('div')
    root.className = 'cm-md-table-column-controls'
    root.style.setProperty('--table-columns', String(this.columnCount))
    root.contentEditable = 'false'
    const spacer = document.createElement('span')
    spacer.className = 'cm-md-table-control-spacer'
    root.append(spacer)
    for (let column = 0; column < this.columnCount; column++) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'cm-md-table-remove-column'
      button.innerHTML = trashIconMarkup
      button.title = this.columnCount > 1 ? t('table.removeColumn') : t('table.needColumn')
      button.setAttribute('aria-label', t('table.removeColumnN', { n: column + 1 }))
      button.disabled = this.columnCount <= 1
      const stop = (event) => {
        event.preventDefault()
        event.stopPropagation()
      }
      button.addEventListener('mousedown', stop)
      button.addEventListener('click', (event) => {
        stop(event)
        removeTableColumnAt(view, this.tableFirst, column)
      })
      root.append(button)
    }
    return root
  }
  ignoreEvent() {
    return false
  }
}

export function tableCellAttributes(cell, header, active, lineFrom, columnCount) {
  const edge = `${cell.index === 0 ? ' cm-md-table-cell-first' : ''}${cell.index === columnCount - 1 ? ' cm-md-table-cell-last' : ''}`
  return {
    class: `cm-md-table-cell${edge}${active ? ' cm-md-table-cell-active' : ''}`,
    'data-column': String(cell.index),
    'data-cell-from': String(lineFrom + cell.from),
    'data-cell-to': String(lineFrom + cell.to),
    'data-cell-empty': cell.to === cell.from ? 'true' : 'false',
    title: t('table.cellHint'),
  }
}

export function tableAt(doc, number) {
  let first = number
  while (first > 1 && tableCells(doc.line(first - 1).text)) first--
  const lines = []
  for (let current = first; current <= doc.lines && tableCells(doc.line(current).text); current++)
    lines.push(doc.line(current).text)
  const relative = number - first
  for (let start = 0; start < lines.length; start++) {
    const group = tableGroupDetails(lines, start)
    if (group && relative >= start && relative < group.end)
      return {
        first: first + start,
        last: first + start + group.end - 1,
        group,
        columnCount: group.columnCount,
      }
  }
  return null
}

export function tableSelectionColumn(view, line, parsed) {
  const selection = view.state.selection
  if (selection.ranges.length !== 1) return -1
  const range = selection.main
  if (range.head < line.from || range.head > line.to) return -1
  const column = tableCellAtOffset(parsed, range.head - line.from)
  const cell = tableCellAtColumn(parsed, column)
  if (!range.empty && (range.from < line.from + cell.from || range.to > line.from + cell.to))
    return -1
  return column
}

export function tableDecorations(ranges, view, line, number, table) {
  const row = number - table.first
  const last = number === table.last || (table.last === table.first + 1 && number === table.first)
  ranges.push(
    Decoration.line({
      attributes: {
        class: `cm-md-table-row${row === 0 ? ' cm-md-table-head' : ''}${last ? ' cm-md-table-last' : ''}`,
        style: `--table-columns:${table.columnCount}`,
      },
    }).range(line.from),
  )
  if (row === 0)
    ranges.push(
      Decoration.widget({
        widget: new TableColumnControlsWidget({
          tableFirst: table.first,
          columnCount: table.columnCount,
        }),
        side: -1,
      }).range(line.from),
    )
  if (row === 1) {
    ranges.push(Decoration.line({ attributes: { class: 'cm-md-table-divider' } }).range(line.from))
    ranges.push(Decoration.replace({}).range(line.from, line.to))
    return
  }
  const parsed = parseTableLine(line.text)
  if (!parsed) return
  const firstCell = tableCellAtColumn(parsed, 0)
  ranges.push(
    Decoration.widget({
      widget: new TableRowControlWidget({
        tableFirst: table.first,
        row: row === 0 ? 0 : row - 1,
        removable: row !== 0 || table.last > table.first + 1,
      }),
      side: -1,
    }).range(line.from + firstCell.from),
  )
  const activeColumn = tableSelectionColumn(view, line, parsed)
  let cursor = 0
  for (let column = 0; column < table.columnCount; column++) {
    const cell = tableCellAtColumn(parsed, column)
    if (cursor < cell.from)
      ranges.push(
        Decoration.mark({ class: 'cm-md-table-source' }).range(
          line.from + cursor,
          line.from + cell.from,
        ),
      )
    const active = column === activeColumn
    if (cell.to > cell.from) {
      ranges.push(
        Decoration.mark({
          attributes: tableCellAttributes(cell, row === 0, active, line.from, table.columnCount),
        }).range(line.from + cell.from, line.from + cell.rawTo),
      )
      addInlineRangeDecorations(ranges, line, cell.from, cell.to, false)
    } else
      ranges.push(
        Decoration.widget({
          widget: new TableCellWidget({
            from: line.from + cell.from,
            to: line.from + cell.to,
            column,
            columnCount: table.columnCount,
            header: row === 0,
            active,
          }),
          side: column + 1,
        }).range(line.from + cell.from),
      )
    cursor = cell.rawTo
  }
  if (cursor < line.length)
    ranges.push(Decoration.mark({ class: 'cm-md-table-source' }).range(line.from + cursor, line.to))
}

export function tableContextAt(view) {
  const selection = view.state.selection
  if (selection.ranges.length !== 1) return null
  const range = selection.main
  const line = view.state.doc.lineAt(range.head)
  const table = tableAt(view.state.doc, line.number)
  if (!table || line.number === table.first + 1) return null
  const parsed = parseTableLine(line.text)
  if (!parsed) return null
  const column = tableCellAtOffset(parsed, range.head - line.from)
  const cell = tableCellAtColumn(parsed, column)
  if (!range.empty && (range.from < line.from + cell.from || range.to > line.from + cell.to))
    return null
  return {
    view,
    table,
    line,
    parsed,
    row: line.number === table.first ? 0 : line.number - table.first - 1,
    column,
    cell,
  }
}

export function tableRowNumber(table, row) {
  return row === 0 ? table.first : table.first + row + 1
}

export function tableCellTarget(view, table, row, column) {
  const line = view.state.doc.line(tableRowNumber(table, row))
  const parsed = parseTableLine(line.text)
  if (!parsed) return null
  const cell = tableCellAtColumn(parsed, column)
  return { line, parsed, cell }
}

export function selectTableCell(view, target) {
  if (!target) return false
  view.dispatch({
    selection: EditorSelection.range(
      target.line.from + target.cell.from,
      target.line.from + target.cell.to,
    ),
    scrollIntoView: true,
  })
  return true
}

export function tableLines(view, table) {
  return Array.from(
    { length: table.last - table.first + 1 },
    (_, index) => view.state.doc.line(table.first + index).text,
  )
}

export function replaceTable(view, table, lines, row, column) {
  const from = view.state.doc.line(table.first).from
  const to = view.state.doc.line(table.last).to
  const lineBreak = view.state.lineBreak
  const range = tableCellRange(lines, row, column, lineBreak, from)
  if (!range) return false
  view.dispatch({
    changes: { from, to, insert: lines.join(lineBreak) },
    selection: EditorSelection.range(range.from, range.to),
    userEvent: 'input.type',
    scrollIntoView: true,
  })
  view.focus()
  requestAnimationFrame(() => {
    if (!view.dom.isConnected) return
    view.focus()
    view.dispatch({ selection: EditorSelection.single(range.from), scrollIntoView: true })
  })
  return true
}

export function addTableRow(view, context) {
  const lines = tableAddRow(tableLines(view, context.table), context.table.columnCount)
  return replaceTable(view, context.table, lines, lines.length - 1, context.column)
}

export function addTableColumn(view, context) {
  const lines = tableAddColumn(tableLines(view, context.table))
  return replaceTable(
    view,
    context.table,
    lines,
    tableLineIndex(context.row),
    context.table.columnCount,
  )
}

export function insertTableRowAt(view, tableFirst, row, column) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const lines = tableLines(view, table)
  const lineIndex = row === 0 ? 1 : tableLineIndex(row)
  const next = tableInsertRow(lines, lineIndex, table.columnCount)
  return replaceTable(view, table, next, lineIndex + 1, column)
}

export function insertTableColumnAt(view, tableFirst, row, column) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const next = tableInsertColumn(tableLines(view, table), column + 1)
  return replaceTable(view, table, next, tableLineIndex(row), column + 1)
}

export function removeTableRowAt(view, tableFirst, row) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const lines = tableLines(view, table)
  if (row === 0) {
    if (lines.length <= 2) return false
    return replaceTable(view, table, [lines[2], lines[1], ...lines.slice(3)], 0, 0)
  }
  const lineIndex = tableLineIndex(row)
  if (lineIndex >= lines.length) return false
  const targetRow = row > 1 ? row - 1 : 0
  return replaceTable(view, table, tableRemoveRow(lines, lineIndex), tableLineIndex(targetRow), 0)
}

export function removeTableColumnAt(view, tableFirst, column) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table || table.columnCount <= 1) return false
  const targetColumn = Math.min(column, table.columnCount - 2)
  return replaceTable(
    view,
    table,
    tableRemoveColumn(tableLines(view, table), column),
    0,
    targetColumn,
  )
}

export function moveTable(view, action) {
  if (view.composing) return false
  const context = tableContextAt(view)
  if (!context) return false
  const { table, row, column, cell } = context
  const bodyRows = table.last - table.first - 1
  const select = (nextRow, nextColumn) =>
    selectTableCell(view, tableCellTarget(view, table, nextRow, nextColumn))
  const target = tableMoveTarget(action, row, column, bodyRows, table.columnCount)
  if (target?.type === 'add-row') return addTableRow(view, context)
  if (target?.type === 'add-column') return addTableColumn(view, context)
  if (target?.type === 'move') return select(target.row, target.column)
  if (action === 'left' || action === 'right') {
    const range = view.state.selection.main
    const exactCell =
      range.from === context.line.from + cell.from && range.to === context.line.from + cell.to
    if (!range.empty && !exactCell) return false
    const head = range.head
    if (action === 'right') {
      if (!range.empty || head >= context.line.from + cell.to)
        return column < table.columnCount - 1 ? select(row, column + 1) : false
      return false
    }
    if (!range.empty || head <= context.line.from + cell.from) {
      if (column > 0) return select(row, column - 1)
      return row > 0 ? select(row - 1, table.columnCount - 1) : false
    }
    return false
  }
  if (action === 'backspace' || action === 'delete') {
    if (!view.state.selection.main.empty) return false
    const head = view.state.selection.main.head
    if (action === 'backspace' && head === context.line.from + cell.from) {
      if (column > 0) return select(row, column - 1)
      return row > 0 ? select(row - 1, table.columnCount - 1) : true
    }
    if (action === 'delete' && head === context.line.from + cell.to) {
      return column < table.columnCount - 1 ? select(row, column + 1) : true
    }
  }
  return false
}
