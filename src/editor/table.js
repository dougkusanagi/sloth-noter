import { t } from '../i18n.js'
import { codeCopyHandler } from './code-copy.js'
import { blockIconMarkup, gripMarkup } from './block-icons.js'
import { openPopupMenu } from './popup-menu.js'
import { addBlockBelow } from './block-actions.js'
import { addInlineRangeDecorations } from './inline-decorations.js'
import { EditorSelection, StateEffect, StateField } from '@codemirror/state'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
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
  tableBlankRow,
  tableCellRange,
  tableInsertColumn,
  tableInsertRow,
  tableLineIndex,
  tableMoveTarget,
  tableRemoveColumn,
  tableRemoveRow,
  tableAxisWrapped,
  tableSetAlignment,
  tableToggleWrap,
} from '../table-navigation.js'

export const trashIconMarkup =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4M11.5 9v4" /></svg>'

export class TableCellWidget extends WidgetType {
  constructor({ from, to, column, columnCount, header, active, extraClass = '' }) {
    super()
    this.from = from
    this.to = to
    this.column = column
    this.columnCount = columnCount
    this.header = header
    this.active = active
    this.extraClass = extraClass
  }
  eq(other) {
    return (
      this.from === other.from &&
      this.to === other.to &&
      this.column === other.column &&
      this.columnCount === other.columnCount &&
      this.header === other.header &&
      this.active === other.active &&
      this.extraClass === other.extraClass
    )
  }
  get cellClass() {
    const edge = `${this.column === 0 ? ' cm-md-table-cell-first' : ''}${this.column === this.columnCount - 1 ? ' cm-md-table-cell-last' : ''}`
    return `cm-md-table-cell${edge}${this.active ? ' cm-md-table-cell-active' : ''}${this.extraClass}`
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

// Which table the pointer is over and which row or column is selected.
// Tables are keyed by the start position of their first line.
export const setTableUi = StateEffect.define()

export const tableUiField = StateField.define({
  create: () => ({ hover: null, axis: null }),
  update(value, tr) {
    let next = value
    if (tr.docChanged && (next.hover != null || next.axis)) {
      const map = (pos) => tr.changes.mapPos(pos, -1)
      next = {
        hover: next.hover == null ? null : map(next.hover),
        axis: next.axis ? { ...next.axis, table: map(next.axis.table) } : null,
      }
    }
    // Typing or placing the cursor ends a row or column selection.
    if (
      next.axis &&
      (tr.isUserEvent('select') || tr.isUserEvent('input') || tr.isUserEvent('delete'))
    )
      next = { ...next, axis: null }
    for (const effect of tr.effects) if (effect.is(setTableUi)) next = { ...next, ...effect.value }
    return next
  },
})

const icons = {
  bold: '<path d="M6 4h5a3 3 0 0 1 0 6H6zM6 10h6a3 3 0 0 1 0 6H6z" />',
  italic: '<path d="M12 4H8.5M11.5 16H8M10.5 4l-1 12" />',
  strike:
    '<path d="M4 10h12M13.5 6.5C13 5 11.7 4 10 4 8 4 6.5 5 6.5 6.6c0 1 .6 1.8 1.6 2.3M6.5 13.5C7 15 8.4 16 10.2 16c2 0 3.5-1 3.5-2.6 0-.6-.2-1.1-.5-1.5" />',
  code: '<path d="M7 6l-4 4 4 4M13 6l4 4-4 4" />',
  left: '<path d="M4 5h12M4 9h8M4 13h12M4 17h8" />',
  center: '<path d="M4 5h12M6 9h8M4 13h12M6 17h8" />',
  right: '<path d="M4 5h12M8 9h8M4 13h12M8 17h8" />',
}
const iconMarkup = (path) =>
  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

export const tableMarkers = [
  ['bold', '**', 'table.bold'],
  ['italic', '_', 'table.italic'],
  ['strike', '~~', 'table.strike'],
  ['code', '`', 'table.code'],
]

function tableButton(label, className, action, content = '+') {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  if (content.startsWith('<')) button.innerHTML = content
  else button.textContent = content
  button.title = label
  button.setAttribute('aria-label', label)
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    action(event)
  })
  return button
}

const clearAxis = () => setTableUi.of({ axis: null })

function selectAxis(view, table, kind, index) {
  const axis = view.state.field(tableUiField).axis
  const same = axis?.table === table && axis.kind === kind && axis.index === index
  view.dispatch({ effects: setTableUi.of({ axis: same ? null : { table, kind, index } }) })
}

function insertRowAtBoundary(view, tableFirst, boundary) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const lines = tableLines(view, table)
  if (boundary > 0) {
    const lineIndex = tableLineIndex(boundary - 1)
    const next = tableInsertRow(lines, lineIndex === 0 ? 1 : lineIndex, table.columnCount)
    return replaceTable(view, table, next, tableLineIndex(boundary), 0, clearAxis())
  }
  const next = [tableBlankRow(table.columnCount), lines[1], lines[0], ...lines.slice(2)]
  return replaceTable(view, table, next, 0, 0, clearAxis())
}

function insertColumnAtBoundary(view, tableFirst, boundary) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const next = tableInsertColumn(tableLines(view, table), boundary)
  return replaceTable(view, table, next, 0, boundary, clearAxis())
}

// A dot on a bar boundary; hovered or focused, it grows into a "+" pin and
// a guide line shows where the new row or column goes.
function insertPin(view, label, className, action) {
  const pin = tableButton(label, `cm-table-pin ${className}`, action, '')
  const dot = document.createElement('span')
  dot.className = 'cm-table-pin-dot'
  dot.setAttribute('aria-hidden', 'true')
  pin.append(dot)
  return pin
}

function guideLine(className) {
  const line = document.createElement('span')
  line.className = `cm-table-guide ${className}`
  line.setAttribute('aria-hidden', 'true')
  return line
}

// The column guide crosses the whole table, which only the rows know.
function sizeColumnGuides(root, tableKey) {
  const rows = root.closest('.cm-content')?.querySelectorAll(`[data-table="${tableKey}"]`)
  if (!rows?.length) return
  const top = root.getBoundingClientRect().bottom
  const bottom = rows[rows.length - 1].getBoundingClientRect().bottom
  root.style.setProperty('--table-guide-height', `${Math.max(0, bottom - top)}px`)
}

function tableToolbar(view, spec) {
  const { tableFirst, kind, index, columnCount, rowCount, pressed, align } = spec
  const isRow = kind === 'row'
  const toolbar = document.createElement('div')
  toolbar.className = 'cm-table-toolbar'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', t(isRow ? 'table.rowActions' : 'table.columnActions'))
  toolbar.contentEditable = 'false'
  const edit = (change, keep = true) => {
    const table = tableAt(view.state.doc, tableFirst)
    if (!table) return
    const lines = tableLines(view, table)
    const next = change(lines, table)
    if (!next) return
    replaceTable(
      view,
      table,
      next,
      isRow ? tableLineIndex(Math.min(index, next.length - 2)) : 0,
      isRow ? 0 : Math.min(index, table.columnCount - 1),
      keep ? undefined : clearAxis(),
    )
  }
  const separator = () => {
    const line = document.createElement('span')
    line.className = 'cm-table-toolbar-separator'
    line.setAttribute('aria-hidden', 'true')
    return line
  }
  if (!isRow) {
    for (const value of ['left', 'center', 'right']) {
      const button = tableButton(
        t(`table.align.${value}`),
        'cm-table-toolbar-button',
        () => edit((lines) => tableSetAlignment(lines, index, value)),
        iconMarkup(icons[value]),
      )
      button.setAttribute('aria-pressed', String(align === value))
      toolbar.append(button)
    }
    toolbar.append(separator())
  }
  for (const [name, marker, label] of tableMarkers) {
    const button = tableButton(
      t(label),
      'cm-table-toolbar-button',
      () =>
        edit((lines) =>
          tableToggleWrap(
            lines,
            isRow ? tableLineIndex(index) : null,
            isRow ? null : index,
            marker,
          ),
        ),
      iconMarkup(icons[name]),
    )
    button.setAttribute('aria-pressed', String(pressed.includes(name)))
    toolbar.append(button)
  }
  toolbar.append(separator())
  const canRemove = isRow ? rowCount > 2 || index > 0 : columnCount > 1
  const removeLabel = t(isRow ? 'table.removeRow' : 'table.removeColumn')
  const remove = tableButton(
    canRemove ? removeLabel : t(isRow ? 'table.needRow' : 'table.needColumn'),
    'cm-table-toolbar-button cm-table-toolbar-remove',
    () => {
      view.contentDOM.classList.remove('cm-table-danger')
      if (isRow) {
        const table = tableAt(view.state.doc, tableFirst)
        if (!table) return
        const lines = tableLines(view, table)
        if (index === 0) {
          if (lines.length <= 2) return
          replaceTable(view, table, [lines[2], lines[1], ...lines.slice(3)], 0, 0, clearAxis())
          return
        }
        edit((current) => tableRemoveRow(current, tableLineIndex(index)), false)
      } else
        edit(
          (lines, table) => (table.columnCount > 1 ? tableRemoveColumn(lines, index) : null),
          false,
        )
    },
    trashIconMarkup,
  )
  remove.setAttribute('aria-label', removeLabel)
  remove.disabled = !canRemove
  const danger = (on) => view.contentDOM.classList.toggle('cm-table-danger', on && canRemove)
  remove.addEventListener('mouseenter', () => danger(true))
  remove.addEventListener('mouseleave', () => danger(false))
  remove.addEventListener('focus', () => danger(true))
  remove.addEventListener('blur', () => danger(false))
  toolbar.append(remove)
  // Keeps the toolbar inside the editor at narrow widths.
  requestAnimationFrame(() => {
    if (!toolbar.isConnected) return
    const box = toolbar.getBoundingClientRect()
    const bounds = view.scrollDOM.getBoundingClientRect()
    const shift =
      box.left < bounds.left + 8
        ? bounds.left + 8 - box.left
        : box.right > bounds.right - 8
          ? bounds.right - 8 - box.right
          : 0
    if (shift) toolbar.style.setProperty('--toolbar-shift', `${shift}px`)
  })
  return toolbar
}

const menuIcons = {
  ...blockIconMarkup,
  headerRow: iconMarkup(
    '<rect x="3.5" y="4" width="13" height="12" rx="1.5" /><path d="M3.5 8h13" stroke-width="3" /><path d="M3.5 12h13M8 8v8M12 8v8" />',
  ),
  headerColumn: iconMarkup(
    '<rect x="3.5" y="4" width="13" height="12" rx="1.5" /><path d="M7 4v12" stroke-width="3" /><path d="M8 8h8.5M8 12h8.5M12 4v12" />',
  ),
}

function tableSource(view, table) {
  return view.state.doc.sliceString(
    (tableFlagsLine(view.state.doc, table) ?? view.state.doc.line(table.first)).from,
    view.state.doc.line(table.last).to,
  )
}

// Removes the table and one blank line next to it, so no gap is left behind.
function deleteTable(view, table) {
  const doc = view.state.doc
  let from = (tableFlagsLine(doc, table) ?? doc.line(table.first)).from
  let to = doc.line(table.last).to
  if (table.last < doc.lines && !doc.line(table.last + 1).text.trim())
    to = doc.line(table.last + 1).to + (table.last + 1 < doc.lines ? 1 : 0)
  else if (table.first > 1) from = doc.line(table.first - 1).to
  else if (to < doc.length) to += 1
  view.dispatch({
    changes: { from, to },
    selection: EditorSelection.single(Math.min(from, doc.length - (to - from))),
    effects: clearAxis(),
    userEvent: 'delete',
    scrollIntoView: true,
  })
  view.focus()
}

function openTableMenu(view, tableFirst, anchor) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return
  const flags = tableFlags(view.state.doc, table)
  const copy = () => view.state.facet(codeCopyHandler)[0]?.(tableSource(view, table))
  openPopupMenu({
    view,
    anchor,
    label: t('table.actions'),
    build: (menu, { item, separator }) =>
      menu.append(
        item(menuIcons.cut, t('table.cut'), () => {
          copy()
          deleteTable(view, table)
        }),
        item(menuIcons.copy, t('table.copy'), copy),
        item(menuIcons.trash, t('table.delete'), () => deleteTable(view, table)),
        separator(),
        item(
          menuIcons.headerRow,
          t('table.headerRow'),
          () => setTableFlags(view, tableFirst, { headerRow: !flags.headerRow }),
          { checked: flags.headerRow },
        ),
        item(
          menuIcons.headerColumn,
          t('table.headerColumn'),
          () => setTableFlags(view, tableFirst, { headerColumn: !flags.headerColumn }),
          { checked: flags.headerColumn },
        ),
        separator(),
        item(menuIcons.add, t('block.addBelow'), () => addBlockBelow(view, table.last)),
      ),
  })
}

export class TableRowControlWidget extends WidgetType {
  constructor(spec) {
    super()
    Object.assign(this, spec)
  }
  eq(other) {
    return (
      this.tableKey === other.tableKey &&
      this.tableFirst === other.tableFirst &&
      this.row === other.row &&
      this.rowCount === other.rowCount &&
      this.columnCount === other.columnCount &&
      this.selected === other.selected &&
      this.pressed === other.pressed
    )
  }
  toDOM(view) {
    const root = document.createElement('span')
    root.className = 'cm-table-row-tools'
    root.contentEditable = 'false'
    const segment = tableButton(
      t('table.selectRow', { n: this.row + 1 }),
      `cm-table-bar-segment cm-table-row-segment${this.selected ? ' is-selected' : ''}`,
      () => selectAxis(view, this.tableKey, 'row', this.row),
      '',
    )
    segment.setAttribute('aria-pressed', String(this.selected))
    root.append(segment)
    const boundaries = this.row === 0 ? [0, 1] : [this.row + 1]
    for (const boundary of boundaries) {
      const before = boundary === this.row
      const place = before ? 'is-before' : 'is-after'
      root.append(
        insertPin(
          view,
          t(before ? 'table.addRowBefore' : 'table.addRow'),
          `cm-table-pin-row ${place}`,
          () => insertRowAtBoundary(view, this.tableFirst, boundary),
        ),
        guideLine(`cm-table-guide-row ${place}`),
      )
    }
    if (this.selected)
      root.append(
        tableToolbar(view, {
          tableFirst: this.tableFirst,
          kind: 'row',
          index: this.row,
          columnCount: this.columnCount,
          rowCount: this.rowCount,
          pressed: this.pressed,
        }),
      )
    return root
  }
  ignoreEvent() {
    return true
  }
}

export class TableColumnControlsWidget extends WidgetType {
  constructor(spec) {
    super()
    Object.assign(this, spec)
  }
  eq(other) {
    return (
      this.tableKey === other.tableKey &&
      this.tableFirst === other.tableFirst &&
      this.columnCount === other.columnCount &&
      this.rowCount === other.rowCount &&
      this.selected === other.selected &&
      this.pressed === other.pressed &&
      this.align === other.align
    )
  }
  toDOM(view) {
    const root = document.createElement('div')
    root.className = 'cm-md-table-column-controls'
    root.style.setProperty('--table-columns', String(this.columnCount))
    root.contentEditable = 'false'
    const handle = tableButton(
      t('table.actions'),
      'cm-table-handle',
      () => openTableMenu(view, this.tableFirst, handle),
      menuIcons.table + gripMarkup,
    )
    handle.setAttribute('aria-haspopup', 'menu')
    handle.setAttribute('aria-expanded', 'false')
    root.append(handle)
    for (let column = 0; column < this.columnCount; column++) {
      const control = document.createElement('span')
      control.className = 'cm-table-column-tool'
      const selected = this.selected === column
      const segment = tableButton(
        t('table.selectColumn', { n: column + 1 }),
        `cm-table-bar-segment cm-table-column-segment${selected ? ' is-selected' : ''}`,
        () => selectAxis(view, this.tableKey, 'column', column),
        '',
      )
      segment.setAttribute('aria-pressed', String(selected))
      control.append(segment)
      const boundaries = column === this.columnCount - 1 ? [column, column + 1] : [column]
      for (const boundary of boundaries) {
        const place = boundary === column ? 'is-before' : 'is-after'
        const pin = insertPin(
          view,
          t(boundary === column ? 'table.addColumnBefore' : 'table.addColumn'),
          `cm-table-pin-column ${place}`,
          () => insertColumnAtBoundary(view, this.tableFirst, boundary),
        )
        const size = () => sizeColumnGuides(root, this.tableKey)
        pin.addEventListener('mouseenter', size)
        pin.addEventListener('focus', size)
        control.append(pin, guideLine(`cm-table-guide-column ${place}`))
      }
      if (selected)
        control.append(
          tableToolbar(view, {
            tableFirst: this.tableFirst,
            kind: 'column',
            index: column,
            columnCount: this.columnCount,
            rowCount: this.rowCount,
            pressed: this.pressed,
            align: this.align,
          }),
        )
      root.append(control)
    }
    return root
  }
  ignoreEvent() {
    return true
  }
}

// Keeps each header row in view while its table scrolls under the top of the
// editor, and lets it go with the last row.
// The shifts go in a style sheet of their own: CodeMirror rewrites a line's
// class and style attributes whenever it redraws the line, which would drop
// them for a frame.
const stuckHeaders = new WeakMap()
let stickyIds = 0
function stickTableHeaders(view) {
  let sticky = stuckHeaders.get(view)
  if (!sticky) {
    const sheet = document.createElement('style')
    view.dom.dataset.stickyTables = String(++stickyIds)
    view.dom.append(sheet)
    sticky = { sheet, shifts: new Map() }
    stuckHeaders.set(view, sticky)
  }
  const headerBottom = document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0
  const top = Math.max(0, view.scrollDOM.getBoundingClientRect().top, headerBottom)
  const shifts = new Map()
  for (const head of view.contentDOM.querySelectorAll('.cm-md-table-headrow')) {
    const key = head.dataset.table
    const rows = view.contentDOM.querySelectorAll(`[data-table="${key}"]`)
    if (rows.length < 2) continue
    const box = head.getBoundingClientRect()
    const natural = box.top - (sticky.shifts.get(key) ?? 0)
    const bottom = rows[rows.length - 1].getBoundingClientRect().bottom
    const shift = Math.max(0, Math.min(top - natural, bottom - box.height - natural))
    if (shift > 0) shifts.set(key, shift)
  }
  const same =
    shifts.size === sticky.shifts.size &&
    [...shifts].every(([key, shift]) => sticky.shifts.get(key) === shift)
  if (same) return
  sticky.shifts = shifts
  const scope = `[data-sticky-tables="${view.dom.dataset.stickyTables}"]`
  sticky.sheet.textContent = [...shifts]
    .map(
      ([key, shift]) =>
        `${scope} .cm-md-table-headrow[data-table="${key}"] { transform: translateY(${shift}px); transition: none; box-shadow: 0 2px 6px #0002; }`,
    )
    .join('\n')
}

// Shows the table controls while the pointer is over a table, and closes a
// row or column selection on a click outside it or on Escape.
export const tableUiPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view
      this.timer = 0
      this.move = (event) => {
        const key = event.target?.closest?.('[data-table]')?.dataset.table
        if (key != null) {
          clearTimeout(this.timer)
          this.timer = 0
          this.setHover(Number(key))
        } else if (!this.timer && view.state.field(tableUiField).hover != null)
          // A short grace period lets the pointer cross the gap to the bars.
          this.timer = setTimeout(() => {
            this.timer = 0
            this.setHover(null)
          }, 300)
      }
      this.leave = () => this.move({ target: null })
      this.down = (event) => {
        if (!view.state.field(tableUiField).axis) return
        if (event.target.closest?.('.cm-table-toolbar, .cm-table-bar-segment')) return
        view.contentDOM.classList.remove('cm-table-danger')
        view.dispatch({ effects: clearAxis() })
      }
      this.key = (event) => {
        if (event.key !== 'Escape' || !view.state.field(tableUiField).axis) return
        event.preventDefault()
        view.contentDOM.classList.remove('cm-table-danger')
        view.dispatch({ effects: clearAxis() })
        view.focus()
      }
      // Runs again on the next frame, after CodeMirror has drawn the lines for the new scroll.
      this.stick = () => {
        stickTableHeaders(view)
        cancelAnimationFrame(this.stickFrame)
        this.stickFrame = requestAnimationFrame(
          () => view.dom.isConnected && stickTableHeaders(view),
        )
      }
      window.addEventListener('scroll', this.stick, { capture: true, passive: true })
      view.dom.addEventListener('mousemove', this.move)
      view.dom.addEventListener('mouseleave', this.leave)
      document.addEventListener('pointerdown', this.down, true)
      document.addEventListener('keydown', this.key, true)
    }
    setHover(hover) {
      if (this.view.state.field(tableUiField).hover === hover) return
      this.view.dispatch({ effects: setTableUi.of({ hover }) })
    }
    update() {
      this.view.requestMeasure({ read: () => null, write: () => stickTableHeaders(this.view) })
    }
    destroy() {
      clearTimeout(this.timer)
      cancelAnimationFrame(this.stickFrame)
      window.removeEventListener('scroll', this.stick, { capture: true })
      this.view.dom.removeEventListener('mousemove', this.move)
      this.view.dom.removeEventListener('mouseleave', this.leave)
      document.removeEventListener('pointerdown', this.down, true)
      document.removeEventListener('keydown', this.key, true)
    }
  },
)

export const tableUi = [tableUiField, tableUiPlugin]

export function tableCellAttributes(
  cell,
  header,
  active,
  lineFrom,
  columnCount,
  align = null,
  extraClass = '',
) {
  const edge = `${cell.index === 0 ? ' cm-md-table-cell-first' : ''}${cell.index === columnCount - 1 ? ' cm-md-table-cell-last' : ''}`
  return {
    class: `cm-md-table-cell${edge}${active ? ' cm-md-table-cell-active' : ''}${extraClass}`,
    'data-column': String(cell.index),
    'data-cell-from': String(lineFrom + cell.from),
    'data-cell-to': String(lineFrom + cell.to),
    'data-cell-empty': cell.to === cell.from ? 'true' : 'false',
    ...(align ? { 'data-align': align } : {}),
    title: t('table.cellHint'),
  }
}

// Header settings live in an HTML comment right above the table, so the file
// stays plain Markdown and other apps simply ignore them.
const TABLE_FLAGS = /^<!--\s*sloth:table\b([^>]*?)-->\s*$/

export function tableFlagsLine(doc, table) {
  if (table.first <= 1) return null
  const line = doc.line(table.first - 1)
  return TABLE_FLAGS.test(line.text) ? line : null
}

export function tableFlags(doc, table) {
  const line = tableFlagsLine(doc, table)
  const words = line ? line.text.match(TABLE_FLAGS)[1].trim().split(/\s+/) : []
  return {
    headerRow: !words.includes('no-header-row'),
    headerColumn: words.includes('header-column'),
  }
}

export function isTableFlagsLine(doc, number) {
  if (number >= doc.lines || !TABLE_FLAGS.test(doc.line(number).text)) return false
  return tableAt(doc, number + 1)?.first === number + 1
}

export function setTableFlags(view, tableFirst, change) {
  const doc = view.state.doc
  const table = tableAt(doc, tableFirst)
  if (!table) return false
  const flags = { ...tableFlags(doc, table), ...change }
  const words = [
    ...(flags.headerRow ? [] : ['no-header-row']),
    ...(flags.headerColumn ? ['header-column'] : []),
  ]
  const comment = words.length ? `<!-- sloth:table ${words.join(' ')} -->` : ''
  const current = tableFlagsLine(doc, table)
  const lineBreak = view.state.lineBreak
  const changes = current
    ? comment
      ? { from: current.from, to: current.to, insert: comment }
      : { from: current.from, to: current.to + lineBreak.length }
    : comment
      ? { from: doc.line(table.first).from, insert: comment + lineBreak }
      : null
  if (!changes) return false
  view.dispatch({ changes, userEvent: 'formatacao' })
  view.focus()
  return true
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

// Marks the row or column formats that every filled cell of the axis already uses.
function pressedMarkers(lines, row, column) {
  return tableMarkers
    .filter(([, marker]) => tableAxisWrapped(lines, row, column, marker))
    .map(([name]) => name)
    .join(',')
}

export function tableDecorations(ranges, view, line, number, table) {
  const row = number - table.first
  const doc = view.state.doc
  const tableKey = doc.line(table.first).from
  const tableEnd = doc.line(table.last).to
  const ui = view.state.field(tableUiField, false) ?? { hover: null, axis: null }
  const axis = ui.axis?.table === tableKey ? ui.axis : null
  const head = view.state.selection.main.head
  const focused = ui.hover === tableKey || Boolean(axis) || (head >= tableKey && head <= tableEnd)
  const visualRow = row === 0 ? 0 : row - 1
  const rowCount = table.last - table.first
  const rowSelected = axis?.kind === 'row' && axis.index === visualRow
  const flags = tableFlags(doc, table)
  const editable = !view.state.readOnly
  const last = number === table.last || (table.last === table.first + 1 && number === table.first)
  ranges.push(
    Decoration.line({
      attributes: {
        class: `cm-md-table-row${row === 0 ? ' cm-md-table-head' : ''}${row === 0 && flags.headerRow ? ' cm-md-table-headrow' : ''}${last ? ' cm-md-table-last' : ''}${focused && editable ? ' cm-md-table-focus' : ''}${rowSelected ? ' cm-table-row-selected' : ''}`,
        style: `--table-columns:${table.columnCount}`,
        'data-table': String(tableKey),
      },
    }).range(line.from),
  )
  const lines = editable && (axis || row === 0) ? tableLines(view, table) : null
  if (row === 0 && editable) {
    const column = axis?.kind === 'column' ? axis.index : null
    ranges.push(
      Decoration.widget({
        widget: new TableColumnControlsWidget({
          tableKey,
          tableFirst: table.first,
          columnCount: table.columnCount,
          rowCount,
          selected: column,
          pressed: column == null ? '' : pressedMarkers(lines, null, column),
          align: column == null ? null : (table.group.alignments[column] ?? null),
        }),
        side: -1,
      }).range(line.from),
    )
  }
  if (row === 1) {
    ranges.push(Decoration.line({ attributes: { class: 'cm-md-table-divider' } }).range(line.from))
    ranges.push(Decoration.replace({}).range(line.from, line.to))
    return
  }
  const parsed = parseTableLine(line.text)
  if (!parsed) return
  const firstCell = tableCellAtColumn(parsed, 0)
  if (editable)
    ranges.push(
      Decoration.widget({
        widget: new TableRowControlWidget({
          tableKey,
          tableFirst: table.first,
          row: visualRow,
          rowCount,
          columnCount: table.columnCount,
          selected: rowSelected,
          pressed: rowSelected ? pressedMarkers(lines, row, null) : '',
        }),
        side: -1,
      }).range(line.from + firstCell.from),
    )
  const cellClass = (column) =>
    `${axis?.kind === 'column' && axis.index === column ? ' cm-table-axis-selected' : ''}${flags.headerColumn && column === 0 ? ' cm-md-table-headcell' : ''}`
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
          attributes: tableCellAttributes(
            cell,
            row === 0,
            active,
            line.from,
            table.columnCount,
            table.group.alignments[column],
            cellClass(column),
          ),
        }).range(line.from + cell.from, line.from + cell.rawTo),
      )
      addInlineRangeDecorations(
        ranges,
        line,
        cell.from,
        cell.to,
        active && !view.state.readOnly,
        true,
      )
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
            extraClass: cellClass(column),
          }),
          side: column + 1,
        }).range(line.from + cell.from),
      )
    cursor = cell.rawTo
  }
  if (cursor < line.text.length)
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

export function replaceTable(view, table, lines, row, column, effects) {
  const from = view.state.doc.line(table.first).from
  const to = view.state.doc.line(table.last).to
  const lineBreak = view.state.lineBreak
  const range = tableCellRange(lines, row, column, lineBreak, from)
  if (!range) return false
  view.dispatch({
    changes: { from, to, insert: lines.join(lineBreak) },
    selection: EditorSelection.range(range.from, range.to),
    userEvent: 'formatacao',
    scrollIntoView: true,
    ...(effects ? { effects } : {}),
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
