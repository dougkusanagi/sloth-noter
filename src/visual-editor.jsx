import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { EditorSelection, EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view'
import { classifyLine, inlineSyntax } from './live-markdown.js'
import { codeTokens, syntaxRanges } from './syntax-highlight.js'
import { parseTableLine, tableCellAtColumn, tableCellAtOffset, tableCells, tableGroupDetails } from './markdown-table.js'
import { tableAddColumn, tableAddRow, tableCellRange, tableInsertColumn, tableInsertRow, tableLineIndex, tableMoveTarget, tableRemoveColumn, tableRemoveRow } from './table-navigation.js'
import { wrapSelection } from './wrap-selection.js'
import { activeFormats, formatSelection } from './format-selection.js'
import { blockTemplate } from './insert-block.js'
import { fencedPasteInEmptyBlock } from './fenced-paste.js'
import { continueBlock } from './continue-block.js'
import { safeHref } from './markdown.jsx'
import { ArrowDownToLine, ArrowRightToLine, CodeXml, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, Quote, Table as TableIcon, Trash2 } from 'lucide-react'

const formatButtons = [
  ['bold', 'Negrito', <strong>B</strong>],
  ['italic', 'Itálico', <em>I</em>],
  ['code', 'Código em linha', <span className="format-code">&lt;/&gt;</span>],
  ['link', 'Link', <span aria-hidden="true">↗</span>],
  ['heading', 'Título 2', <span>H₂</span>],
  ['quote', 'Citação', <span>❝</span>],
  ['list', 'Lista', <span>☷</span>],
]
const blockButtons = [
  ['h2', 'Título 2'], ['h3', 'Título 3'], ['h4', 'Título 4'],
  ['quote', 'Citação'], ['list', 'Lista com marcadores'], ['numbered', 'Lista numerada'],
  ['table', 'Tabela'], ['code', 'Bloco de código'],
]
const trashIconMarkup = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4M11.5 9v4" /></svg>'

function TableMenuIcon({ kind }) {
  const props = { size: 16, 'aria-hidden': true }
  if (kind === 'row') return <ArrowDownToLine {...props} />
  if (kind === 'column') return <ArrowRightToLine {...props} />
  return <Trash2 {...props} />
}

const blockIcons = {
  h1: Heading1, h2: Heading2, h3: Heading3, h4: Heading4,
  quote: Quote, list: List, numbered: ListOrdered, table: TableIcon, code: CodeXml,
}

function BlockIcon({ action }) {
  const Icon = blockIcons[action]
  if (!Icon) return null
  return <Icon className="block-icon" aria-hidden="true" />
}

class TableCellWidget extends WidgetType {
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
    return this.from === other.from && this.to === other.to && this.column === other.column && this.columnCount === other.columnCount && this.header === other.header && this.active === other.active
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
    dom.setAttribute('role', this.header ? 'columnheader' : 'cell')
    dom.setAttribute('aria-colindex', String(this.column + 1))
    dom.title = 'Enter/Tab navega · Enter no fim cria linha · Tab no fim cria coluna'
    return true
  }
  toDOM() {
    const cell = document.createElement('span')
    cell.className = this.cellClass
    cell.dataset.column = String(this.column)
    cell.dataset.cellFrom = String(this.from)
    cell.dataset.cellTo = String(this.to)
    cell.dataset.cellEmpty = this.from === this.to ? 'true' : 'false'
    cell.setAttribute('role', this.header ? 'columnheader' : 'cell')
    cell.setAttribute('aria-colindex', String(this.column + 1))
    cell.title = 'Enter/Tab navega · Enter no fim cria linha · Tab no fim cria coluna'
    cell.contentEditable = 'false'
    return cell
  }
  ignoreEvent() { return false }
}

class TableRowControlWidget extends WidgetType {
  constructor({ tableFirst, row, removable }) {
    super()
    this.tableFirst = tableFirst
    this.row = row
    this.removable = removable
  }
  eq(other) { return this.tableFirst === other.tableFirst && this.row === other.row && this.removable === other.removable }
  toDOM(view) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-md-table-remove-row'
    button.innerHTML = trashIconMarkup
    button.title = this.removable ? 'Remover linha' : 'A tabela precisa de pelo menos uma linha de dados'
    button.setAttribute('aria-label', 'Remover linha')
    button.disabled = !this.removable
    const stop = event => { event.preventDefault(); event.stopPropagation() }
    button.addEventListener('mousedown', stop)
    button.addEventListener('click', event => {
      stop(event)
      removeTableRowAt(view, this.tableFirst, this.row)
    })
    return button
  }
  ignoreEvent() { return false }
}

class TableColumnControlsWidget extends WidgetType {
  constructor({ tableFirst, columnCount }) {
    super()
    this.tableFirst = tableFirst
    this.columnCount = columnCount
  }
  eq(other) { return this.tableFirst === other.tableFirst && this.columnCount === other.columnCount }
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
      button.title = this.columnCount > 1 ? 'Remover coluna' : 'A tabela precisa de pelo menos uma coluna'
      button.setAttribute('aria-label', `Remover coluna ${column + 1}`)
      button.disabled = this.columnCount <= 1
      const stop = event => { event.preventDefault(); event.stopPropagation() }
      button.addEventListener('mousedown', stop)
      button.addEventListener('click', event => {
        stop(event)
        removeTableColumnAt(view, this.tableFirst, column)
      })
      root.append(button)
    }
    return root
  }
  ignoreEvent() { return false }
}

function tableCellAttributes(cell, header, active, lineFrom, columnCount) {
  const edge = `${cell.index === 0 ? ' cm-md-table-cell-first' : ''}${cell.index === columnCount - 1 ? ' cm-md-table-cell-last' : ''}`
  return {
    class: `cm-md-table-cell${edge}${active ? ' cm-md-table-cell-active' : ''}`,
    role: header ? 'columnheader' : 'cell',
    'aria-colindex': String(cell.index + 1),
    'data-column': String(cell.index),
    'data-cell-from': String(lineFrom + cell.from),
    'data-cell-to': String(lineFrom + cell.to),
    'data-cell-empty': cell.to === cell.from ? 'true' : 'false',
    title: 'Enter/Tab navega · Enter no fim cria linha · Tab no fim cria coluna',
  }
}

function tableAt(doc, number) {
  let first = number
  while (first > 1 && tableCells(doc.line(first - 1).text)) first--
  const lines = []
  for (let current = first; current <= doc.lines && tableCells(doc.line(current).text); current++) lines.push(doc.line(current).text)
  const relative = number - first
  for (let start = 0; start < lines.length; start++) {
    const group = tableGroupDetails(lines, start)
    if (group && relative >= start && relative < group.end) return { first: first + start, last: first + start + group.end - 1, group, columnCount: group.columnCount }
  }
  return null
}

function tableSelectionColumn(view, line, parsed) {
  const selection = view.state.selection
  if (selection.ranges.length !== 1) return -1
  const range = selection.main
  if (range.head < line.from || range.head > line.to) return -1
  const column = tableCellAtOffset(parsed, range.head - line.from)
  const cell = tableCellAtColumn(parsed, column)
  if (!range.empty && (range.from < line.from + cell.from || range.to > line.from + cell.to)) return -1
  return column
}

function tableDecorations(ranges, view, line, number, table) {
  const row = number - table.first
  const last = number === table.last || (table.last === table.first + 1 && number === table.first)
  ranges.push(Decoration.line({ attributes: { class: `cm-md-table-row${row === 0 ? ' cm-md-table-head' : ''}${last ? ' cm-md-table-last' : ''}`, role: 'row', 'aria-rowindex': String(row + 1), style: `--table-columns:${table.columnCount}` } }).range(line.from))
  if (row === 0) ranges.push(Decoration.widget({ widget: new TableColumnControlsWidget({ tableFirst: table.first, columnCount: table.columnCount }), side: -1 }).range(line.from))
  if (row === 1) {
    ranges.push(Decoration.line({ attributes: { class: 'cm-md-table-divider' } }).range(line.from))
    ranges.push(Decoration.replace({}).range(line.from, line.to))
    return
  }
  const parsed = parseTableLine(line.text)
  if (!parsed) return
  const firstCell = tableCellAtColumn(parsed, 0)
  ranges.push(Decoration.widget({ widget: new TableRowControlWidget({ tableFirst: table.first, row: row === 0 ? 0 : row - 1, removable: row !== 0 || table.last > table.first + 1 }), side: -1 }).range(line.from + firstCell.from))
  const activeColumn = tableSelectionColumn(view, line, parsed)
  let cursor = 0
  for (let column = 0; column < table.columnCount; column++) {
    const cell = tableCellAtColumn(parsed, column)
    if (cursor < cell.from) ranges.push(Decoration.mark({ class: 'cm-md-table-source' }).range(line.from + cursor, line.from + cell.from))
    const active = column === activeColumn
    if (cell.to > cell.from) {
      ranges.push(Decoration.mark({ attributes: tableCellAttributes(cell, row === 0, active, line.from, table.columnCount) }).range(line.from + cell.from, line.from + cell.rawTo))
      addInlineRangeDecorations(ranges, line, cell.from, cell.to, false)
    } else ranges.push(Decoration.widget({ widget: new TableCellWidget({ from: line.from + cell.from, to: line.from + cell.to, column, columnCount: table.columnCount, header: row === 0, active }), side: column + 1 }).range(line.from + cell.from))
    cursor = cell.rawTo
  }
  if (cursor < line.length) ranges.push(Decoration.mark({ class: 'cm-md-table-source' }).range(line.from + cursor, line.to))
}

function tableContextAt(view) {
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
  if (!range.empty && (range.from < line.from + cell.from || range.to > line.from + cell.to)) return null
  return { view, table, line, parsed, row: line.number === table.first ? 0 : line.number - table.first - 1, column, cell }
}

function tableRowNumber(table, row) {
  return row === 0 ? table.first : table.first + row + 1
}

function tableCellTarget(view, table, row, column) {
  const line = view.state.doc.line(tableRowNumber(table, row))
  const parsed = parseTableLine(line.text)
  if (!parsed) return null
  const cell = tableCellAtColumn(parsed, column)
  return { line, parsed, cell }
}

function selectTableCell(view, target) {
  if (!target) return false
  view.dispatch({ selection: EditorSelection.range(target.line.from + target.cell.from, target.line.from + target.cell.to), scrollIntoView: true })
  return true
}

function tableLines(view, table) {
  return Array.from({ length: table.last - table.first + 1 }, (_, index) => view.state.doc.line(table.first + index).text)
}

function replaceTable(view, table, lines, row, column) {
  const from = view.state.doc.line(table.first).from
  const to = view.state.doc.line(table.last).to
  const lineBreak = view.state.lineBreak
  const range = tableCellRange(lines, row, column, lineBreak, from)
  if (!range) return false
  view.dispatch({ changes: { from, to, insert: lines.join(lineBreak) }, selection: EditorSelection.range(range.from, range.to), userEvent: 'input.type', scrollIntoView: true })
  view.focus()
  requestAnimationFrame(() => {
    if (!view.dom.isConnected) return
    view.focus()
    view.dispatch({ selection: EditorSelection.single(range.from), scrollIntoView: true })
  })
  return true
}

function addTableRow(view, context) {
  const lines = tableAddRow(tableLines(view, context.table), context.table.columnCount)
  return replaceTable(view, context.table, lines, lines.length - 1, context.column)
}

function addTableColumn(view, context) {
  const lines = tableAddColumn(tableLines(view, context.table))
  return replaceTable(view, context.table, lines, tableLineIndex(context.row), context.table.columnCount)
}

function insertTableRowAt(view, tableFirst, row, column) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const lines = tableLines(view, table)
  const lineIndex = row === 0 ? 1 : tableLineIndex(row)
  const next = tableInsertRow(lines, lineIndex, table.columnCount)
  return replaceTable(view, table, next, lineIndex + 1, column)
}

function insertTableColumnAt(view, tableFirst, row, column) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const next = tableInsertColumn(tableLines(view, table), column + 1)
  return replaceTable(view, table, next, tableLineIndex(row), column + 1)
}

function removeTableRowAt(view, tableFirst, row) {
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

function removeTableColumnAt(view, tableFirst, column) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table || table.columnCount <= 1) return false
  const targetColumn = Math.min(column, table.columnCount - 2)
  return replaceTable(view, table, tableRemoveColumn(tableLines(view, table), column), 0, targetColumn)
}

function moveTable(view, action) {
  if (view.composing) return false
  const context = tableContextAt(view)
  if (!context) return false
  const { table, row, column, cell } = context
  const bodyRows = table.last - table.first - 1
  const select = (nextRow, nextColumn) => selectTableCell(view, tableCellTarget(view, table, nextRow, nextColumn))
  const target = tableMoveTarget(action, row, column, bodyRows, table.columnCount)
  if (target?.type === 'add-row') return addTableRow(view, context)
  if (target?.type === 'add-column') return addTableColumn(view, context)
  if (target?.type === 'move') return select(target.row, target.column)
  if (action === 'left' || action === 'right') {
    const range = view.state.selection.main
    const exactCell = range.from === context.line.from + cell.from && range.to === context.line.from + cell.to
    if (!range.empty && !exactCell) return false
    const head = range.head
    if (action === 'right') {
      if (!range.empty || head >= context.line.from + cell.to) return column < table.columnCount - 1 ? select(row, column + 1) : false
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

function wrapSelectedText(event, view) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false
  const ranges = view.state.selection.ranges
  if (!ranges.some(range => !range.empty)) return false
  const changes = [], selections = []
  for (const range of ranges) {
    const wrapped = wrapSelection(view.state.doc.sliceString(range.from, range.to), 0, range.to - range.from, event.key)
    if (!wrapped) return false
    changes.push({ from: range.from, to: range.to, insert: wrapped.insert })
  }
  let offset = 0
  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index], insert = changes[index].insert
    selections.push(EditorSelection.range(range.from + offset + 1, range.from + offset + insert.length - 1))
    offset += insert.length - (range.to - range.from)
  }
  view.dispatch({ changes, selection: EditorSelection.create(selections, view.state.selection.mainIndex), userEvent: 'input.type' })
  event.preventDefault()
  return true
}

function continueList(view) {
  if (view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty) return false
  const continued = continueBlock(view.state.doc.toString(), view.state.selection.main.head)
  if (!continued) return false
  view.dispatch({ changes: { from: continued.from, to: continued.to, insert: continued.insert }, selection: { anchor: continued.cursor }, userEvent: 'input.type' })
  return true
}

function navigateToFence(view, direction) {
  if (view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty) return false
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const next = line.number + direction
  if (next < 1 || next > view.state.doc.lines) return false
  const target = view.state.doc.line(next)
  if (!target.text.startsWith('```')) return false
  view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true })
  return true
}

function addInlineRangeDecorations(ranges, line, from, to, editing) {
  for (const token of inlineSyntax(line.text.slice(from, to))) {
    const start = line.from + from + token.start, end = line.from + from + token.end
    const contentStart = line.from + from + token.contentStart, contentEnd = line.from + from + token.contentEnd
    if (!editing) {
      if (start < contentStart) ranges.push(Decoration.replace({}).range(start, contentStart))
      if (contentEnd < end) ranges.push(Decoration.replace({}).range(contentEnd, end))
    }
    if (token.kind === 'link') {
      const href = safeHref(line.text.slice(from + token.contentEnd + 2, from + token.end - 1))
      ranges.push(Decoration.mark({ class: 'cm-md-inline-link', attributes: { title: 'Ctrl + clique · Abrir link ↗', 'data-href': href ?? '' } }).range(contentStart, contentEnd))
    } else ranges.push(Decoration.mark({ class: `cm-md-inline-${token.kind}` }).range(contentStart, contentEnd))
  }
}

function addInlineDecorations(ranges, line, shape, editing) {
  addInlineRangeDecorations(ranges, line, shape.prefix, line.text.length, editing)
}

function lineAttributes(line, shape, active) {
  const classes = [shape.kind === 'paragraph' ? 'cm-md-paragraph' : `cm-md-${shape.kind}`]
  if (active) classes.push('cm-md-editing')
  if (shape.prefix && shape.kind !== 'fence') classes.push('cm-md-prefix')
  const syntax = shape.kind === 'fence' || shape.kind === 'code' || shape.kind === 'paragraph' ? [] : inlineSyntax(line.text.slice(shape.prefix))
  const reserve = syntax.reduce((length, token) => length + token.contentStart - token.start + token.end - token.contentEnd, 0)
  if (reserve) classes.push('cm-md-syntax')
  const attributes = { class: classes.join(' ') }
  if (reserve) attributes.style = `--md-syntax-reserve:${reserve}ch`
  return attributes
}

function decorationsFor(view) {
  const doc = view.state.doc, ranges = []
  const editing = new Set(), selectedLines = []
  for (const selection of view.state.selection.ranges) {
    const first = doc.lineAt(selection.from).number, last = doc.lineAt(selection.to).number
    selectedLines.push({ first, last })
    for (let number = first; number <= last; number++) editing.add(number)
  }
  let openFence = null
  const fenceStarts = new Set(), fenceEnds = new Set()
  for (let number = 1; number <= doc.lines; number++) {
    if (!doc.line(number).text.startsWith('```')) continue
    if (openFence === null) openFence = number
    else {
      if (selectedLines.some(range => range.first <= number && range.last >= openFence)) { editing.add(openFence); editing.add(number) }
      fenceStarts.add(openFence)
      fenceEnds.add(number)
      openFence = null
    }
  }
  if (openFence !== null && selectedLines.some(range => range.last >= openFence)) editing.add(openFence)
  if (openFence !== null) fenceStarts.add(openFence)
  for (const visible of view.visibleRanges) {
    const first = doc.lineAt(visible.from).number, last = doc.lineAt(visible.to).number
    let inFence = false, fenceLanguage = ''
    for (let number = 1; number < first; number++) {
      if (doc.line(number).text.startsWith('```')) { inFence = !inFence; fenceLanguage = inFence ? doc.line(number).text.slice(3).trim() : '' }
    }
    for (let number = first; number <= last; number++) {
      const line = doc.line(number), shape = classifyLine(line.text, inFence)
      inFence = shape.nextFence
      if (shape.kind === 'fence') fenceLanguage = inFence ? line.text.slice(3).trim() : ''
      if (shape.kind === 'code') {
        ranges.push(Decoration.line({ attributes: { class: 'cm-md-code' } }).range(line.from))
        for (const token of syntaxRanges(codeTokens(line.text, fenceLanguage)).ranges) {
          ranges.push(Decoration.mark({ class: token.types.map(type => `syntax-${type}`).join(' ') }).range(line.from + token.from, line.from + token.to))
        }
        continue
      }
      const table = shape.kind === 'table' ? tableAt(doc, number) : null
      if (table) {
        tableDecorations(ranges, view, line, number, table)
        continue
      }
      const active = editing.has(number)
      const attrs = lineAttributes(line, shape, active)
      if (shape.kind === 'fence') {
        if (fenceStarts.has(number)) attrs.class += ' cm-md-fence-start'
        if (fenceEnds.has(number)) attrs.class += ' cm-md-fence-end'
      }
      if (active) {
        ranges.push(Decoration.line({ attributes: attrs }).range(line.from))
        if (shape.kind !== 'fence' && shape.kind !== 'table') addInlineDecorations(ranges, line, shape, true)
        continue
      }
      ranges.push(Decoration.line({ attributes: attrs }).range(line.from))
      if (shape.prefix) ranges.push(Decoration.replace({}).range(line.from, line.from + shape.prefix))
      if (shape.kind === 'fence') continue
      addInlineDecorations(ranges, line, shape, false)
    }
  }
  return Decoration.set(ranges, true)
}

const liveMarkdown = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = decorationsFor(view) }
  update(update) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = decorationsFor(update.view)
  }
}, { decorations: plugin => plugin.decorations })

export function VisualEditor({ noteId, body, onChange, onReady }) {
  const host = useRef(null), viewRef = useRef(null), syncing = useRef(false)
  const [toolbar, setToolbar] = useState(null)
  const [insertAt, setInsertAt] = useState(null)
  const [blockMenu, setBlockMenu] = useState(false)
  const [tableMenu, setTableMenu] = useState(null)
  const blockMenuRef = useRef(false)
  blockMenuRef.current = blockMenu
  const [linkEditing, setLinkEditing] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const linkInput = useRef(null)
  const callbacks = useRef({ onChange, onReady })
  callbacks.current = { onChange, onReady }

  function positionToolbar(view) {
    const selection = view.state.selection.main
    if (selection.empty || !view.hasFocus) { setToolbar(null); return }
    const start = view.coordsAtPos(selection.from), end = view.coordsAtPos(selection.to)
    if (!start || !end) { setToolbar(null); return }
    if (start.top < 48 || start.top > window.innerHeight) { setToolbar(null); return }
    const margin = Math.min(124, window.innerWidth / 2)
    const x = Math.max(margin, Math.min(window.innerWidth - margin, (start.left + end.right) / 2))
    const y = start.top > 55 ? start.top - 8 : end.bottom + 8
    setToolbar({ x, y, below: start.top <= 55, active: activeFormats(view.state.doc.toString(), selection.from, selection.to) })
  }

  function positionInsert(view, position = view.state.selection.main.head) {
    if (blockMenuRef.current) return
    if (!view.state.selection.main.empty) { setInsertAt(null); setBlockMenu(false); return }
    const line = view.state.doc.lineAt(position)
    if (line.text.trim()) { if (!blockMenuRef.current) setInsertAt(null); return }
    const coords = view.coordsAtPos(line.from)
    if (!coords || coords.top < 48 || coords.top > window.innerHeight) { if (!blockMenuRef.current) setInsertAt(null); return }
    setInsertAt({ from: line.from, x: Math.max(5, coords.left - 34), y: coords.top })
  }

  function insertBlock(action) {
    const view = viewRef.current, template = blockTemplate(action)
    if (!view || !template || !insertAt) return
    view.dispatch({ changes: { from: insertAt.from, insert: template.text }, selection: EditorSelection.single(insertAt.from + template.selectionFrom, insertAt.from + template.selectionTo), userEvent: 'input.type' })
    setBlockMenu(false)
    setInsertAt(null)
    view.focus()
  }

  function applyFormat(action, url = '') {
    const view = viewRef.current
    if (!view) return
    const selection = view.state.selection.main
    const result = formatSelection(view.state.doc.toString(), selection.from, selection.to, action, url)
    if (!result) return
    view.dispatch({ changes: { from: result.from, to: result.to, insert: result.insert }, selection: EditorSelection.single(result.selectionFrom, result.selectionTo), userEvent: 'input.type' })
    view.focus()
    setLinkEditing(false)
    setLinkUrl('')
    positionToolbar(view)
  }

  function runTableMenu(action) {
    const menu = tableMenu, view = viewRef.current
    if (!menu || !view) return
    setTableMenu(null)
    if (action === 'add-row') insertTableRowAt(view, menu.tableFirst, menu.row, menu.column)
    if (action === 'add-column') insertTableColumnAt(view, menu.tableFirst, menu.row, menu.column)
    if (action === 'remove-row') removeTableRowAt(view, menu.tableFirst, menu.row)
    if (action === 'remove-column') removeTableColumnAt(view, menu.tableFirst, menu.column)
  }

  useEffect(() => { if (linkEditing) linkInput.current?.focus() }, [linkEditing])
  useEffect(() => { if (blockMenu) host.current?.querySelector('.block-menu button')?.focus() }, [blockMenu])
  useEffect(() => {
    if (!blockMenu) return
    function closeOnOutsideClick(event) {
      if (event.target.closest?.('.insert-trigger, .block-menu')) return
      flushSync(() => { setBlockMenu(false); setInsertAt(null) })
    }
    document.addEventListener('pointerdown', closeOnOutsideClick, true)
    document.addEventListener('click', closeOnOutsideClick, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick, true)
      document.removeEventListener('click', closeOnOutsideClick, true)
    }
  }, [blockMenu])

  useEffect(() => {
    if (!tableMenu) return
    function closeOnOutsideClick(event) {
      if (!event.target.closest?.('.table-context-menu')) setTableMenu(null)
    }
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setTableMenu(null)
      viewRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsideClick, true)
    document.addEventListener('click', closeOnOutsideClick, true)
    document.addEventListener('keydown', closeOnEscape, true)
    const frame = requestAnimationFrame(() => host.current?.querySelector('.table-context-menu button:not(:disabled)')?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOnOutsideClick, true)
      document.removeEventListener('click', closeOnOutsideClick, true)
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [tableMenu])

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: body,
        extensions: [
          history(),
          keymap.of([
            { key: 'Enter', run: view => moveTable(view, 'enter') },
            { key: 'Shift-Enter', run: view => moveTable(view, 'shift-enter') },
            { key: 'Tab', run: view => moveTable(view, 'tab') },
            { key: 'Shift-Tab', run: view => moveTable(view, 'shift-tab') },
            { key: 'ArrowUp', run: view => moveTable(view, 'up') },
            { key: 'ArrowDown', run: view => moveTable(view, 'down') },
            { key: 'ArrowLeft', run: view => moveTable(view, 'left') },
            { key: 'ArrowRight', run: view => moveTable(view, 'right') },
            { key: 'Home', run: view => moveTable(view, 'home') },
            { key: 'End', run: view => moveTable(view, 'end') },
            { key: 'Backspace', run: view => moveTable(view, 'backspace') },
            { key: 'Delete', run: view => moveTable(view, 'delete') },
            { key: 'Enter', run: continueList },
            { key: 'ArrowDown', run: view => navigateToFence(view, 1) },
            { key: 'ArrowUp', run: view => navigateToFence(view, -1) },
            ...defaultKeymap, ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Editor Markdown visual', spellcheck: 'false' }),
          EditorView.domEventHandlers({
            keydown: wrapSelectedText,
            paste: (event, view) => {
              const selection = view.state.selection.main
              const pasted = event.clipboardData?.getData('text/plain')
              const replacement = pasted && fencedPasteInEmptyBlock(view.state.doc, selection.from, selection.to, pasted)
              if (!replacement) return false
              event.preventDefault()
              view.dispatch({ changes: { from: replacement.from, to: replacement.to, insert: replacement.insert }, selection: EditorSelection.single(replacement.selection), userEvent: 'input.paste' })
              return true
            },
             mousedown: (event, view) => {
               const cell = event.target.closest?.('.cm-md-table-cell')
               if (cell?.dataset.cellEmpty === 'true') {
                 event.preventDefault()
                 event.stopPropagation()
                 const from = Number(cell.dataset.cellFrom)
                 view.focus()
                 view.dispatch({ selection: EditorSelection.single(from), scrollIntoView: true })
                 return true
               }
               const link = event.target.closest?.('.cm-md-inline-link')
                if (link && (event.ctrlKey || event.metaKey) && link.dataset.href) {
                  event.preventDefault()
                  event.stopPropagation()
                  window.open(link.dataset.href, '_blank', 'noopener,noreferrer')
                  return true
                }
                if (cell || event.target.closest?.('button')) return false
                const line = event.target.closest?.('.cm-line')
                if (line && !line.classList.contains('cm-md-table-row')) return false
                const position = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? (event.target.closest?.('.cm-content, .cm-scroller') ? view.state.doc.length : null)
                if (position === null) return false
                event.preventDefault()
                view.focus()
                view.dispatch({ selection: EditorSelection.single(position) })
                return true
              },
             contextmenu: (event, view) => {
               const cell = event.target.closest?.('.cm-md-table-cell')
               if (!cell) return false
               const from = Number(cell.dataset.cellFrom)
               if (!Number.isSafeInteger(from)) return false
               const line = view.state.doc.lineAt(from)
               const table = tableAt(view.state.doc, line.number)
               if (!table || line.number === table.first + 1) return false
               const column = Number(cell.dataset.column)
               const row = line.number === table.first ? 0 : line.number - table.first - 1
               const x = Math.max(8, Math.min(event.clientX || cell.getBoundingClientRect().left, window.innerWidth - 270))
               const y = Math.max(8, Math.min(event.clientY || cell.getBoundingClientRect().top, window.innerHeight - 250))
               event.preventDefault()
               event.stopPropagation()
               setTableMenu({ x, y, row, column, tableFirst: table.first, columnCount: table.columnCount, hasBody: table.last > table.first + 1 })
               return true
             },
             focus: (_event, view) => { positionToolbar(view); positionInsert(view); return false },
            blur: event => { if (!event.relatedTarget?.closest?.('.format-toolbar')) setToolbar(null); if (!event.relatedTarget?.closest?.('.insert-trigger, .block-menu')) { setInsertAt(null); setBlockMenu(false) } return false },
            mousemove: (event, view) => { if (!blockMenuRef.current) { const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }); if (pos !== null) positionInsert(view, pos) } return false },
          }),
          liveMarkdown,
          EditorView.updateListener.of(update => {
            if (update.docChanged && !syncing.current) callbacks.current.onChange(update.state.doc.toString())
            if (update.selectionSet || update.docChanged || update.viewportChanged) { positionToolbar(update.view); positionInsert(update.view) }
          }),
        ],
      }),
      parent: host.current,
    })
    viewRef.current = view
    const focusBlankArea = event => {
      if (event.target.closest?.('.cm-line, .cm-md-table-cell, button, .format-toolbar, .insert-trigger, .block-menu')) return
      const position = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.doc.length
      event.preventDefault()
      view.focus()
      view.dispatch({ selection: EditorSelection.single(position) })
    }
    view.scrollDOM.addEventListener('scroll', () => { positionToolbar(view); positionInsert(view) })
    view.scrollDOM.addEventListener('mousedown', focusBlankArea)
    callbacks.current.onReady(view)
    return () => { callbacks.current.onReady(null); viewRef.current = null; view.scrollDOM.removeEventListener('mousedown', focusBlankArea); view.destroy() }
  }, [noteId])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === body) return
    syncing.current = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: body } })
    syncing.current = false
  }, [body])

  return <div className="visual-editor" ref={host}>
    {toolbar && <div className={`format-toolbar${toolbar.below ? ' below' : ''}`} role="toolbar" aria-label="Formatação do texto selecionado" style={{ left: toolbar.x, top: toolbar.y }} onMouseDown={event => { if (!event.target.closest('input')) event.preventDefault() }}>
      {linkEditing ? <form className="format-link" onSubmit={event => { event.preventDefault(); applyFormat('link', linkUrl) }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setLinkEditing(false); viewRef.current?.focus() } }}>
        <input ref={linkInput} aria-label="Endereço do link" type="text" inputMode="url" placeholder="https://..." value={linkUrl} onChange={event => setLinkUrl(event.target.value)} required />
        <button type="submit" aria-label="Aplicar link" title="Aplicar link">↗</button>
      </form> : formatButtons.map(([action, label, icon]) => <button key={action} type="button" title={label} aria-label={label} aria-pressed={toolbar.active.includes(action)} className={toolbar.active.includes(action) ? 'active' : undefined} onClick={() => action === 'link' && !toolbar.active.includes('link') ? setLinkEditing(true) : applyFormat(action)}>{icon}</button>)}
    </div>}
    {insertAt && <>
      <button type="button" className="insert-trigger" aria-label="Inserir bloco" aria-expanded={blockMenu} title="Inserir bloco" style={{ left: insertAt.x, top: insertAt.y }} onMouseDown={event => event.preventDefault()} onClick={() => setBlockMenu(value => !value)}>+</button>
      {blockMenu && <div className="block-menu" role="menu" aria-label="Inserir bloco" style={{ left: Math.max(8, insertAt.x), top: Math.max(52, Math.min(insertAt.y + 30, window.innerHeight - Math.min(350, window.innerHeight * .6) - 8)) }} onMouseDown={event => event.preventDefault()} onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll('button')]
        const index = buttons.indexOf(document.activeElement)
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus() }
        if (event.key === 'Home') { event.preventDefault(); buttons[0]?.focus() }
        if (event.key === 'End') { event.preventDefault(); buttons.at(-1)?.focus() }
        if (event.key === 'Escape') { event.preventDefault(); setBlockMenu(false); viewRef.current?.focus() }
        if (event.key === 'Tab') setBlockMenu(false)
      }}>
        {blockButtons.map(([action, label]) => <button key={action} type="button" role="menuitem" onClick={() => insertBlock(action)}><BlockIcon action={action} /><span>{label}</span></button>)}
      </div>}
    </>}
    {tableMenu && <div className="table-context-menu" role="menu" aria-label="Ações da tabela" style={{ left: tableMenu.x, top: tableMenu.y }} onMouseDown={event => event.preventDefault()} onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
      const index = buttons.indexOf(document.activeElement)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus() }
      if (event.key === 'Home') { event.preventDefault(); buttons[0]?.focus() }
      if (event.key === 'End') { event.preventDefault(); buttons.at(-1)?.focus() }
      if (event.key === 'Escape') { event.preventDefault(); setTableMenu(null); viewRef.current?.focus() }
    }}>
      <div className="table-context-menu-heading">Tabela</div>
      <button type="button" role="menuitem" onClick={() => runTableMenu('add-row')}><span className="table-context-menu-icon"><TableMenuIcon kind="row" /></span><span>Adicionar linha abaixo</span><span className="menu-shortcut"><kbd>Enter</kbd></span></button>
      <button type="button" role="menuitem" onClick={() => runTableMenu('add-column')}><span className="table-context-menu-icon"><TableMenuIcon kind="column" /></span><span>Adicionar coluna à direita</span><span className="menu-shortcut"><kbd>Tab</kbd></span></button>
      <div className="table-context-menu-separator" />
      <button type="button" role="menuitem" disabled={tableMenu.row === 0 && !tableMenu.hasBody} onClick={() => runTableMenu('remove-row')}><span className="table-context-menu-icon"><TableMenuIcon kind="trash" /></span><span>Remover linha</span></button>
      <button type="button" role="menuitem" disabled={tableMenu.columnCount <= 1} onClick={() => runTableMenu('remove-column')}><span className="table-context-menu-icon"><TableMenuIcon kind="trash" /></span><span>Remover coluna</span></button>
    </div>}
  </div>
}
