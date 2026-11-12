// Tables work like a spreadsheet: a click selects a cell, dragging or Shift
// selects a range, arrows and Tab move the selection, and a double click, F2,
// Enter on... or typing opens a small editor inside the cell. The note keeps
// plain Markdown; the editor writes the cell back when it closes.
import {
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  Transaction,
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  drawSelection,
  keymap,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands'
import { parseTableLine, tableCellAtColumn, tableCellAtOffset } from '../markdown-table.js'
import { tableAddRow, tableCellRange, tableLineIndex } from '../table-navigation.js'
import {
  decodeCell,
  encodeCell,
  normalizeRange,
  parseTsv,
  tableClearCells,
  tableToggleCellsWrap,
  tableValues,
  tableWriteCells,
  toTsv,
} from '../table-sheet.js'
import { columnName, FORMULA_FUNCTIONS } from '../formula.js'
import { t } from '../i18n.js'
import { tableAt, tableFlagsLine } from './table.js'

export const setSheet = StateEffect.define()

const sameCell = (a, b) => a && b && a.row === b.row && a.column === b.column

// The table cell that holds the whole selection, if any.
function cellAtSelection(doc, selection) {
  const range = selection.main
  const line = doc.lineAt(range.head)
  if (doc.lineAt(range.anchor).number !== line.number) return null
  const table = tableAt(doc, line.number)
  if (!table || line.number === table.first + 1) return null
  const parsed = parseTableLine(line.text)
  if (!parsed) return null
  const column = tableCellAtOffset(parsed, range.head - line.from)
  const cell = tableCellAtColumn(parsed, column)
  if (
    !cell ||
    range.from < line.from + cell.rawFrom - 1 ||
    range.to > line.from + Math.max(cell.rawTo, cell.to)
  )
    return null
  return {
    table: doc.line(table.first).from,
    cell: { row: line.number === table.first ? 0 : line.number - table.first - 1, column },
  }
}

export const sheetField = StateField.define({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setSheet)) return effect.value
    let next = value
    if (next && tr.docChanged) next = { ...next, table: tr.changes.mapPos(next.table, -1) }
    if (!tr.selection && !tr.docChanged) return next
    if (tr.startState.readOnly) return null
    // The browser cannot place the note's cursor inside a drawn cell and
    // reports another place; that report does not move the cell selection.
    if (next && !tr.docChanged && tr.annotation(Transaction.userEvent) === 'select') return next
    const found = cellAtSelection(tr.newDoc, tr.newSelection)
    if (!found) {
      // The browser may put its own cursor next to a cell, between the hidden
      // pipes: the selected cell stays while the cursor is still on the table.
      if (!next) return null
      const head = tr.newSelection.main.head
      const table = tableAt(tr.newDoc, tr.newDoc.lineAt(head).number)
      const inside =
        table &&
        tr.newDoc.line(table.first).from === next.table &&
        tr.newDoc.lineAt(tr.newSelection.main.anchor).number >= table.first &&
        tr.newDoc.lineAt(tr.newSelection.main.anchor).number <= table.last
      return inside ? next : null
    }
    // The selection still sits on the same cell: the range and the editor stay.
    if (next && next.table === found.table && sameCell(next.head, found.cell)) return next
    return { table: found.table, anchor: found.cell, head: found.cell, editing: null }
  },
})

export function sheetTable(state, key) {
  if (key == null || key < 0 || key > state.doc.length) return null
  const line = state.doc.lineAt(key)
  if (line.from !== key) return null
  const table = tableAt(state.doc, line.number)
  if (!table || table.first !== line.number) return null
  return table
}

function tableLines(state, table) {
  return Array.from(
    { length: table.last - table.first + 1 },
    (_, index) => state.doc.line(table.first + index).text,
  )
}

const rowCount = (table) => table.last - table.first

function cellPosition(state, table, cell) {
  const line = state.doc.line(cell.row === 0 ? table.first : table.first + cell.row + 1)
  const parsed = parseTableLine(line.text)
  return line.from + (parsed ? tableCellAtColumn(parsed, cell.column).from : 0)
}

// Selects a cell or a range; the hidden text cursor goes into the head cell.
export function selectCells(view, key, anchor, head = anchor, editing = null) {
  const table = sheetTable(view.state, key)
  if (!table) return false
  const clamp = (cell) => ({
    row: Math.max(0, Math.min(rowCount(table) - 1, cell.row)),
    column: Math.max(0, Math.min(table.columnCount - 1, cell.column)),
  })
  const value = { table: key, anchor: clamp(anchor), head: clamp(head), editing }
  view.dispatch({
    selection: EditorSelection.cursor(cellPosition(view.state, table, value.head)),
    effects: [
      setSheet.of(value),
      EditorView.scrollIntoView(cellPosition(view.state, table, value.head)),
    ],
    userEvent: 'select.sheet',
  })
  return true
}

// Replaces the table lines and selects a cell of the new table.
function rewrite(view, table, lines, anchor, head = anchor, userEvent = 'input') {
  const doc = view.state.doc
  const from = doc.line(table.first).from
  const to = doc.line(table.last).to
  const lineBreak = view.state.lineBreak
  const insert = lines.join(lineBreak)
  const target = tableCellRange(lines, tableLineIndex(head.row), head.column, lineBreak, from)
  view.dispatch({
    changes: insert === doc.sliceString(from, to) ? [] : { from, to, insert },
    selection: EditorSelection.cursor(target ? target.from : from),
    effects: setSheet.of({ table: from, anchor, head, editing: null }),
    userEvent,
    scrollIntoView: true,
  })
  return true
}

function cellSource(state, table, cell) {
  return tableValues(tableLines(state, table))[cell.row]?.[cell.column] ?? ''
}

// Opens the editor in the head cell. `text` replaces the content (typing);
// without it the editor starts with the cell text.
export function startEditing(view, { text = null, mode = 'edit', x = null, y = null } = {}) {
  const sheet = view.state.field(sheetField, false)
  if (!sheet || sheet.editing || view.state.readOnly) return false
  const table = sheetTable(view.state, sheet.table)
  if (!table) return false
  view.dispatch({
    effects: setSheet.of({
      ...sheet,
      anchor: sheet.head,
      editing: {
        ...sheet.head,
        text,
        mode,
        x,
        y,
        original: cellSource(view.state, table, sheet.head).trim(),
      },
    }),
  })
  // The editor exists as soon as the view has drawn it; focusing it now keeps
  // the next keys typed quickly from reaching the note.
  const editor = cellEditor(view)
  if (editor) {
    editor.focus()
    // A double click puts the cursor where it was clicked.
    if (x != null && text == null) {
      const position = editor.posAtCoords({ x, y })
      if (position != null) editor.dispatch({ selection: { anchor: position } })
    }
  }
  // Typing over a cell replaces its text right away.
  if (text != null) syncCell(view, text)
  return true
}

function cellEditor(view) {
  return view.contentDOM.querySelector('.cm-sheet-editing')?.sheetEditor ?? null
}

// Closes the editor. With `save`, the text goes into the cell; `move` then
// selects a neighbour, as Enter and Tab do in a spreadsheet.
export function finishEditing(view, { save = true, move = null, editor = null } = {}) {
  const sheet = view.state.field(sheetField, false)
  if (!sheet?.editing) return false
  const table = sheetTable(view.state, sheet.table)
  if (!table) {
    view.dispatch({ effects: setSheet.of(null) })
    return false
  }
  const nested = editor ?? view.contentDOM.querySelector('.cm-sheet-editing')?.sheetEditor ?? null
  const cell = { row: sheet.editing.row, column: sheet.editing.column }
  let lines = tableLines(view.state, table)
  // The cell already follows the editor as it types; Escape puts the old text back.
  const value = save
    ? nested
      ? encodeCell(nested.state.doc.toString())
      : null
    : sheet.editing.original
  if (value != null && value !== cellSource(view.state, table, cell).trim())
    lines = tableWriteCells(lines, cell.row, cell.column, [[value]])
  let target = cell
  const rows = lines.length - 1
  // Enter goes down; on the last row it stays, so finishing a cell never adds a row.
  if (move === 'down') target = { row: Math.min(cell.row + 1, rows - 1), column: cell.column }
  else if (move === 'up') target = { row: Math.max(0, cell.row - 1), column: cell.column }
  else if (move === 'right' || move === 'left') target = stepColumn(cell, move, table.columnCount)
  if (target.row >= lines.length - 1) lines = tableAddRow(lines, table.columnCount)
  if (nested) nested.sheetClosed = true
  rewrite(view, table, lines, target)
  view.dom.sheetFocus?.()
  return true
}

// Writes the editor text into its cell while the editor stays open, so the
// note is saved as the person types.
function syncCell(view, text) {
  const sheet = view.state.field(sheetField, false)
  if (!sheet?.editing) return
  const table = sheetTable(view.state, sheet.table)
  if (!table) return
  const { row, column } = sheet.editing
  const line = view.state.doc.line(row === 0 ? table.first : table.first + row + 1)
  const parsed = parseTableLine(line.text)
  const cell = parsed?.cells[column]
  if (!cell) return
  const value = encodeCell(text)
  const insert = value ? ` ${value} ` : '  '
  if (line.text.slice(cell.rawFrom, cell.rawTo) === insert) return
  view.dispatch({
    changes: { from: line.from + cell.rawFrom, to: line.from + cell.rawTo, insert },
    selection: EditorSelection.cursor(line.from + cell.rawFrom + 1),
    userEvent: 'input.type',
  })
}

// Tab moves right and wraps to the next row; Shift+Tab moves back.
function stepColumn(cell, direction, columns) {
  if (direction === 'right')
    return cell.column < columns - 1
      ? { row: cell.row, column: cell.column + 1 }
      : { row: cell.row + 1, column: 0 }
  if (cell.column > 0) return { row: cell.row, column: cell.column - 1 }
  return cell.row > 0 ? { row: cell.row - 1, column: columns - 1 } : cell
}

// Leaves the table for the text above or below it.
function leaveTable(view, table, direction, create = true) {
  const doc = view.state.doc
  if (direction === 'up') {
    const flags = tableFlagsLine(doc, table)
    const above = (flags ? flags.number : table.first) - 1
    if (above < 1) return true
    view.dispatch({
      selection: EditorSelection.cursor(doc.line(above).to),
      effects: setSheet.of(null),
      scrollIntoView: true,
      userEvent: 'select',
    })
    view.focus()
    return true
  }
  if (table.last < doc.lines) {
    view.dispatch({
      selection: EditorSelection.cursor(doc.line(table.last + 1).from),
      effects: setSheet.of(null),
      scrollIntoView: true,
      userEvent: 'select',
    })
    view.focus()
    return true
  }
  const end = doc.line(table.last).to
  // Escape on the last block of the note goes to the text above instead of adding a line.
  if (!create) return leaveTable(view, table, 'up')
  view.dispatch({
    changes: { from: end, insert: view.state.lineBreak },
    selection: EditorSelection.cursor(end + view.state.lineBreak.length),
    effects: setSheet.of(null),
    scrollIntoView: true,
    userEvent: 'input',
  })
  view.focus()
  return true
}

function activeSheet(view) {
  const sheet = view.state.field(sheetField, false)
  if (!sheet || sheet.editing || view.state.readOnly) return null
  const table = sheetTable(view.state, sheet.table)
  return table ? { sheet, table } : null
}

const move =
  (dRow, dColumn, extend = false) =>
  (view) => {
    const active = activeSheet(view)
    if (!active) return false
    const { sheet, table } = active
    const from = sheet.head
    const row = from.row + dRow
    if (!extend && row < 0) return leaveTable(view, table, 'up')
    if (!extend && row >= rowCount(table)) return leaveTable(view, table, 'down')
    const head = { row, column: from.column + dColumn }
    return selectCells(view, sheet.table, extend ? sheet.anchor : head, head)
  }

// Enter moves down; on the last row it adds a row, as typing a list does.
function enterDown(view) {
  const active = activeSheet(view)
  if (!active) return false
  const { sheet, table } = active
  const next = { row: sheet.head.row + 1, column: sheet.head.column }
  if (next.row < rowCount(table)) return selectCells(view, sheet.table, next)
  return rewrite(view, table, tableAddRow(tableLines(view.state, table), table.columnCount), next)
}

const tab = (direction) => (view) => {
  const active = activeSheet(view)
  if (!active) return false
  const { sheet, table } = active
  const rows = rowCount(table)
  const next = stepColumn(sheet.head, direction, table.columnCount)
  if (next.row >= rows) {
    const lines = tableAddRow(tableLines(view.state, table), table.columnCount)
    return rewrite(view, table, lines, next)
  }
  return selectCells(view, sheet.table, next)
}

const edge =
  (side, extend = false) =>
  (view) => {
    const active = activeSheet(view)
    if (!active) return false
    const { sheet, table } = active
    const head = { row: sheet.head.row, column: side === 'start' ? 0 : table.columnCount - 1 }
    return selectCells(view, sheet.table, extend ? sheet.anchor : head, head)
  }

function clearRange(view) {
  const active = activeSheet(view)
  if (!active) return false
  const { sheet, table } = active
  rewrite(
    view,
    table,
    tableClearCells(tableLines(view.state, table), sheet),
    sheet.anchor,
    sheet.head,
    'delete',
  )
  return true
}

const wrap = (marker) => (view) => {
  const active = activeSheet(view)
  if (!active) return false
  const { sheet, table } = active
  rewrite(
    view,
    table,
    tableToggleCellsWrap(tableLines(view.state, table), sheet, marker),
    sheet.anchor,
    sheet.head,
    'formatacao',
  )
  return true
}

function selectedValues(state, sheet, table) {
  const values = tableValues(tableLines(state, table))
  const { top, bottom, left, right } = normalizeRange(sheet)
  const rows = []
  for (let row = top; row <= bottom; row++) {
    const items = []
    for (let column = left; column <= right; column++)
      items.push(decodeCell(values[row]?.[column] ?? ''))
    rows.push(items)
  }
  return rows
}

function pasteText(view, text) {
  const active = activeSheet(view)
  if (!active) return false
  const { sheet, table } = active
  const values = parseTsv(text).map((row) => row.map(encodeCell))
  const { top, left } = normalizeRange(sheet)
  const height = values.length
  const width = Math.max(...values.map((row) => row.length))
  const lines = tableWriteCells(tableLines(view.state, table), top, left, values)
  rewrite(
    view,
    table,
    lines,
    { row: top, column: left },
    { row: top + height - 1, column: left + width - 1 },
    'input.paste',
  )
  return true
}

// Keys while cells are selected. Each binding is [key, run, run with Shift].
const bindings = {
  ArrowUp: [move(-1, 0), move(-1, 0, true)],
  ArrowDown: [move(1, 0), move(1, 0, true)],
  ArrowLeft: [move(0, -1), move(0, -1, true)],
  ArrowRight: [move(0, 1), move(0, 1, true)],
  Enter: [enterDown, move(-1, 0)],
  Tab: [tab('right'), tab('left')],
  Home: [edge('start'), edge('start', true)],
  End: [edge('end'), edge('end', true)],
  F2: [(view) => startEditing(view)],
  Delete: [clearRange],
  Backspace: [clearRange],
  Escape: [
    (view) => {
      const active = activeSheet(view)
      if (!active) return false
      // A range shrinks to its cell; a single cell gives the keyboard back to the text.
      if (!sameCell(active.sheet.anchor, active.sheet.head))
        return selectCells(view, active.sheet.table, active.sheet.head)
      return leaveTable(view, active.table, 'down', false)
    },
  ],
}
const modBindings = {
  a: (view) => {
    const active = activeSheet(view)
    if (!active) return false
    return selectCells(
      view,
      active.sheet.table,
      { row: 0, column: 0 },
      { row: rowCount(active.table) - 1, column: active.table.columnCount - 1 },
    )
  },
  b: wrap('**'),
  i: wrap('_'),
  z: (view) => undo(view),
  y: (view) => redo(view),
}

function cellOf(view, element) {
  const cell = element?.closest?.('.cm-md-table-cell[data-row]')
  if (!cell || !view.contentDOM.contains(cell)) return null
  const row = cell.closest('.cm-md-table-row')
  return {
    element: cell,
    table: Number(row?.dataset.table),
    row: Number(cell.dataset.row),
    column: Number(cell.dataset.column),
  }
}

// While cells are selected, the keyboard goes to a small hidden field placed
// on the selected cell, as in a spreadsheet: the note's text cursor stays out
// of the table, and typing (also with accents and input methods) starts the
// cell editor.
const sheetInput = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view
      const input = document.createElement('textarea')
      input.className = 'cm-sheet-input'
      input.setAttribute('aria-hidden', 'true')
      input.tabIndex = -1
      input.autocomplete = 'off'
      input.spellcheck = false
      this.input = input
      view.dom.append(input)
      input.addEventListener('keydown', (event) => this.keydown(event))
      input.addEventListener('input', (event) => {
        if (event.isComposing) return
        this.type()
      })
      input.addEventListener('compositionend', () => this.type())
      input.addEventListener('copy', (event) => this.copy(event, false))
      input.addEventListener('cut', (event) => this.copy(event, true))
      input.addEventListener('paste', (event) => {
        const text = event.clipboardData?.getData('text/plain')
        if (!text) return
        event.preventDefault()
        pasteText(view, text)
      })
      view.dom.sheetFocus = () => this.focus()
      view.dom.sheetKeydown = (event) => this.keydown(event)
    }
    type() {
      const text = this.input.value
      this.input.value = ''
      if (text) startEditing(this.view, { text, mode: 'enter' })
    }
    copy(event, cut) {
      const active = activeSheet(this.view)
      if (!active) return
      event.preventDefault()
      event.clipboardData?.setData(
        'text/plain',
        toTsv(selectedValues(this.view.state, active.sheet, active.table)),
      )
      if (cut) clearRange(this.view)
    }
    keydown(event) {
      const { view } = this
      if (event.isComposing) return false
      const mod = event.ctrlKey || event.metaKey
      let run = null
      if (mod && !event.altKey) {
        const key = event.key.toLowerCase()
        run = key === 'z' && event.shiftKey ? modBindings.y : modBindings[key]
      } else if (!event.altKey) {
        const binding = bindings[event.key]
        run = binding && (event.shiftKey ? (binding[1] ?? binding[0]) : binding[0])
      }
      if (run && run(view) !== false) {
        event.preventDefault()
        event.stopPropagation()
        return true
      }
      return false
    }
    focus() {
      // A request from before the editor opened must not take the focus from it.
      const current = this.view.state.field(sheetField, false)
      if (!current || current.editing) return
      const cell = this.view.contentDOM.querySelector('.cm-sheet-cursor')
      if (cell) {
        const box = cell.getBoundingClientRect()
        const host = this.view.dom.getBoundingClientRect()
        this.input.style.left = `${box.left - host.left}px`
        this.input.style.top = `${box.top - host.top}px`
      }
      if (document.activeElement !== this.input) this.input.focus({ preventScroll: true })
    }
    update(update) {
      const before = update.startState.field(sheetField, false)
      const after = update.state.field(sheetField, false)
      if (before === after) return
      const active = after && !after.editing && !update.state.readOnly
      const owned =
        update.view.hasFocus ||
        document.activeElement === this.input ||
        document.activeElement === document.body ||
        !document.activeElement
      if (active && owned)
        update.view.requestMeasure({ read: () => null, write: () => this.focus() })
    }
    destroy() {
      this.input.remove()
    }
  },
)

// Mouse: a click selects, Shift+click or dragging extends, a double click
// edits. On touch screens a tap on the selected cell edits it.
const sheetMouse = Prec.highest(
  EditorView.domEventHandlers({
    mousedown(event, view) {
      if (view.state.readOnly || event.button === 1) return false
      const hit = cellOf(view, event.target)
      if (!hit) return false
      if (hit.element.classList.contains('cm-sheet-editing')) return false
      if (event.target.closest('input, .cm-table-pin, button')) return false
      // Ctrl or Cmd + click opens a link or a note link instead of selecting.
      if ((event.ctrlKey || event.metaKey) && event.target.closest('a, [data-wiki]')) return false
      const sheet = view.state.field(sheetField, false)
      const position = { row: hit.row, column: hit.column }
      if (event.button === 2) {
        const inside =
          sheet?.table === hit.table &&
          (() => {
            const { top, bottom, left, right } = normalizeRange(sheet)
            return hit.row >= top && hit.row <= bottom && hit.column >= left && hit.column <= right
          })()
        if (!inside) {
          if (sheet?.editing) finishEditing(view)
          selectCells(view, hit.table, position)
        }
        return false
      }
      event.preventDefault()
      if (sheet?.editing) finishEditing(view)
      const current = view.state.field(sheetField, false)
      const touch = event.sourceCapabilities?.firesTouchEvents
      if (
        touch &&
        current?.table === hit.table &&
        sameCell(current.head, position) &&
        sameCell(current.anchor, position)
      )
        return startEditing(view, { x: event.clientX, y: event.clientY })
      const extend = event.shiftKey && current?.table === hit.table
      selectCells(view, hit.table, extend ? current.anchor : position, position)
      view.dom.sheetFocus?.()
      const anchor = extend ? current.anchor : position
      const drag = (next) => {
        const over = cellOf(view, document.elementFromPoint(next.clientX, next.clientY))
        const latest = view.state.field(sheetField, false)
        if (!over || over.table !== hit.table || !latest || latest.editing) return
        if (sameCell(latest.head, over)) return
        selectCells(view, hit.table, anchor, { row: over.row, column: over.column })
      }
      const stop = () => {
        window.removeEventListener('mousemove', drag)
        window.removeEventListener('mouseup', stop)
      }
      window.addEventListener('mousemove', drag)
      window.addEventListener('mouseup', stop)
      return true
    },
    // Keys that reach the note while a cell is selected (the hidden field has
    // not taken the focus yet) are handled the same way.
    keydown(event, view) {
      const current = view.state.field(sheetField, false)
      if (!current || view.state.readOnly) return false
      if (current.editing) {
        const editor = cellEditor(view)
        if (!editor || editor.hasFocus) return false
        editor.focus()
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false
        event.preventDefault()
        const range = editor.state.selection.main
        editor.dispatch({
          changes: { from: range.from, to: range.to, insert: event.key },
          selection: { anchor: range.from + 1 },
        })
        return true
      }
      const handled = view.dom.sheetKeydown?.(event)
      if (handled) return true
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false
      if (event.key.length !== 1) return false
      event.preventDefault()
      return startEditing(view, { text: event.key, mode: 'enter' })
    },
    beforeinput(event, view) {
      const current = view.state.field(sheetField, false)
      if (!current || view.state.readOnly) return false
      event.preventDefault()
      return true
    },
    dblclick(event, view) {
      if (view.state.readOnly) return false
      const hit = cellOf(view, event.target)
      if (!hit || hit.element.classList.contains('cm-sheet-editing')) return false
      if (event.target.closest('input, a')) return false
      event.preventDefault()
      const sheet = view.state.field(sheetField, false)
      if (sheet?.table !== hit.table || !sameCell(sheet.head, hit))
        selectCells(view, hit.table, { row: hit.row, column: hit.column })
      return startEditing(view, { x: event.clientX, y: event.clientY })
    },
  }),
)

// Inside the cell editor, list and task lines away from the cursor show their
// bullet or checkbox; the cursor line shows the Markdown so it can be edited.
class EditorCheckbox extends WidgetType {
  constructor(checked, at) {
    super()
    this.checked = checked
    this.at = at
  }
  eq(other) {
    return this.checked === other.checked && this.at === other.at
  }
  toDOM(view) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.className = 'task-checkbox cm-table-task'
    input.checked = this.checked
    input.setAttribute('aria-label', t('table.task'))
    input.addEventListener('mousedown', (event) => event.preventDefault())
    input.addEventListener('change', () =>
      view.dispatch({
        changes: { from: this.at, to: this.at + 1, insert: input.checked ? 'x' : ' ' },
      }),
    )
    return input
  }
  ignoreEvent() {
    return true
  }
}

class EditorBullet extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const bullet = document.createElement('span')
    bullet.className = 'cm-table-list-marker'
    bullet.textContent = '•'
    return bullet
  }
}

function previewDecorations(state) {
  const head = state.doc.lineAt(state.selection.main.head).number
  const ranges = []
  for (let number = 1; number <= state.doc.lines; number++) {
    if (number === head) continue
    const line = state.doc.line(number)
    const task = /^(\s*)[-*+]\s+\[([ xX])\]\s/.exec(line.text)
    const bullet = !task && /^(\s*)[-*+]\s/.exec(line.text)
    if (task)
      ranges.push(
        Decoration.replace({
          widget: new EditorCheckbox(task[2] !== ' ', line.from + task[0].indexOf('[') + 1),
        }).range(line.from + task[1].length, line.from + task[0].length - 1),
      )
    else if (bullet)
      ranges.push(
        Decoration.replace({ widget: new EditorBullet() }).range(
          line.from + bullet[1].length,
          line.from + bullet[0].length - 1,
        ),
      )
  }
  return Decoration.set(ranges)
}

const editorPreview = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = previewDecorations(view.state)
    }
    update(update) {
      if (update.docChanged || update.selectionSet)
        this.decorations = previewDecorations(update.state)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

// Shift+Enter breaks the line; in a list or task it starts the next item, and
// on an empty item it ends the list.
function newLine(view) {
  const range = view.state.selection.main
  const line = view.state.doc.lineAt(range.head)
  const before = view.state.sliceDoc(line.from, range.from)
  const item = /^(\s*)(?:([-*+])\s+(\[[ xX]\]\s+)?|(\d+)([.)])\s+)/.exec(before)
  if (item && range.empty && !line.text.slice(item[0].length).trim()) {
    view.dispatch({ changes: { from: line.from, to: line.to }, selection: { anchor: line.from } })
    return true
  }
  const marker = !item
    ? ''
    : item[4]
      ? `${item[1]}${Number(item[4]) + 1}${item[5]} `
      : `${item[1]}${item[2]} ${item[3] ? '[ ] ' : ''}`
  const insert = `\n${marker}`
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
    scrollIntoView: true,
  })
  return true
}

export class SheetEditor extends WidgetType {
  constructor({ key, source, attributes, editing }) {
    super()
    Object.assign(this, { key, source, attributes, editing })
  }
  eq(other) {
    return this.key === other.key
  }
  toDOM(parent) {
    const cell = document.createElement('span')
    for (const [name, value] of Object.entries(this.attributes)) cell.setAttribute(name, value)
    cell.classList.add('cm-sheet-editing')
    cell.contentEditable = 'false'
    const { editing } = this
    const text = editing.text ?? decodeCell(this.source)
    const finish = (options) => () => {
      if (nested.sheetClosed) return true
      return finishEditing(parent, { ...options, editor: nested })
    }
    const arrow = (direction, isLast) => (view) => {
      if (editing.mode !== 'enter') return false
      const head = view.state.selection.main.head
      if (!isLast(view, head)) return false
      return finish({ move: direction })()
    }
    let suggestions = null
    let matches = []
    let selected = 0
    let prefixStart = 0
    const closeSuggestions = () => {
      suggestions?.remove()
      suggestions = null
      nested.contentDOM.removeAttribute('aria-controls')
      nested.contentDOM.removeAttribute('aria-activedescendant')
    }
    const chooseSuggestion = () => {
      if (!suggestions || !matches.length) return false
      const name = matches[selected]
      const head = nested.state.selection.main.head
      closeSuggestions()
      nested.dispatch({
        changes: { from: prefixStart, to: head, insert: `${name}()` },
        selection: { anchor: prefixStart + name.length + 1 },
      })
      nested.focus()
      return true
    }
    const updateSuggestions = () => {
      const { state } = nested
      const head = state.selection.main.head
      const before = state.doc.sliceString(0, head)
      const match = /^\s*=\s*([A-Za-zÀ-ÿ.]*)$/.exec(before)
      if (!match || !state.selection.main.empty) return closeSuggestions()
      const query = match[1]
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
      matches = FORMULA_FUNCTIONS.filter((name) => name.startsWith(query))
      if (!matches.length) return closeSuggestions()
      prefixStart = head - match[1].length
      selected = Math.min(selected, matches.length - 1)
      if (!suggestions) {
        suggestions = document.createElement('div')
        suggestions.className = 'sheet-formula-suggestions'
        suggestions.id = `sheet-formula-${Math.random().toString(36).slice(2)}`
        suggestions.setAttribute('role', 'listbox')
        suggestions.setAttribute('aria-label', t('table.formulaFunctions'))
        cell.append(suggestions)
        nested.contentDOM.setAttribute('aria-controls', suggestions.id)
      }
      suggestions.replaceChildren(
        ...matches.map((name, index) => {
          const option = document.createElement('div')
          option.id = `${suggestions.id}-${index}`
          option.setAttribute('role', 'option')
          option.setAttribute('aria-selected', String(index === selected))
          option.textContent = name
          option.addEventListener('mousedown', (event) => {
            event.preventDefault()
            selected = index
            chooseSuggestion()
          })
          return option
        }),
      )
      const option = suggestions.children[selected]
      if (option.offsetTop < suggestions.scrollTop) suggestions.scrollTop = option.offsetTop
      else if (
        option.offsetTop + option.offsetHeight >
        suggestions.scrollTop + suggestions.clientHeight
      )
        suggestions.scrollTop = option.offsetTop + option.offsetHeight - suggestions.clientHeight
      const bounds = cell.getBoundingClientRect()
      const above = bounds.top
      const below = window.innerHeight - bounds.bottom
      const openAbove = below < 180 && above > below
      suggestions.style.top = openAbove ? 'auto' : '100%'
      suggestions.style.bottom = openAbove ? '100%' : 'auto'
      suggestions.style.maxHeight = `${Math.max(40, Math.min(180, (openAbove ? above : below) - 8))}px`
      nested.contentDOM.setAttribute('aria-activedescendant', `${suggestions.id}-${selected}`)
    }
    const nested = new EditorView({
      parent: cell,
      state: EditorState.create({
        doc: text,
        selection: { anchor: text.length },
        extensions: [
          history(),
          drawSelection({ cursorBlinkRate: 1000 }),
          EditorView.lineWrapping,
          editorPreview,
          EditorView.contentAttributes.of({
            'aria-label': t('table.cellEditor', {
              cell: `${columnName(editing.column)}${editing.row + 1}`,
            }),
          }),
          Prec.highest(
            keymap.of([
              { key: 'Enter', run: () => chooseSuggestion() || finish({ move: 'down' })() },
              { key: 'Shift-Enter', run: newLine },
              { key: 'Mod-Enter', run: newLine },
              { key: 'Tab', run: () => chooseSuggestion() || finish({ move: 'right' })() },
              { key: 'Shift-Tab', run: finish({ move: 'left' }) },
              {
                key: 'Escape',
                run: () => {
                  if (!suggestions) return finish({ save: false })()
                  closeSuggestions()
                  return true
                },
              },
              {
                key: 'ArrowUp',
                run: (view) => {
                  if (suggestions) {
                    selected = (selected + matches.length - 1) % matches.length
                    updateSuggestions()
                    return true
                  }
                  return arrow('up', (view, head) => view.state.doc.lineAt(head).number === 1)(view)
                },
              },
              {
                key: 'ArrowDown',
                run: (view) => {
                  if (suggestions) {
                    selected = (selected + 1) % matches.length
                    updateSuggestions()
                    return true
                  }
                  return arrow(
                    'down',
                    (view, head) => view.state.doc.lineAt(head).number === view.state.doc.lines,
                  )(view)
                },
              },
              { key: 'ArrowLeft', run: arrow('left', (_view, head) => head === 0) },
              {
                key: 'ArrowRight',
                run: arrow('right', (view, head) => head === view.state.doc.length),
              },
            ]),
          ),
          keymap.of([...historyKeymap, ...defaultKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !nested.sheetClosed)
              syncCell(parent, update.state.doc.toString())
            if (update.docChanged || (suggestions && update.selectionSet)) updateSuggestions()
          }),
          EditorView.domEventHandlers({
            // Leaving the editor saves the cell, as clicking elsewhere does in a spreadsheet.
            blur(event) {
              if (nested.sheetClosed || cell.contains(event.relatedTarget)) return false
              requestAnimationFrame(() => {
                if (!nested.sheetClosed && cell.isConnected)
                  finishEditing(parent, { editor: nested })
              })
              return false
            },
          }),
        ],
      }),
    })
    cell.sheetEditor = nested
    if (editing.text === '=') updateSuggestions()
    return cell
  }
  destroy(dom) {
    if (dom.sheetEditor) {
      dom.sheetEditor.sheetClosed = true
      dom.sheetEditor.destroy()
    }
  }
  ignoreEvent() {
    return true
  }
}

// The text cursor of the note is hidden while a cell is selected.
const sheetAttributes = EditorView.contentAttributes.compute([sheetField], (state) =>
  state.field(sheetField) ? { class: 'cm-sheet-active' } : {},
)

// The browser cannot place the note's cursor inside a drawn cell and reports
// another place, often the start of the note. While cells are selected, such
// reports are dropped, so the note's cursor stays on the selected cell.
const keepCursorOnCell = EditorState.transactionFilter.of((tr) => {
  if (
    tr.docChanged ||
    !tr.selection ||
    tr.effects.length ||
    tr.annotation(Transaction.userEvent) !== 'select'
  )
    return tr
  const current = tr.startState.field(sheetField, false)
  return current ? [] : tr
})

export const sheet = [sheetField, keepCursorOnCell, sheetInput, sheetMouse, sheetAttributes]
