import { BACKGROUND_COLORS, TEXT_COLORS } from '../document-palette.js'
import { colorPalettePanel } from './color-palette.js'
import { tableResize } from './table-resize.js'
import { spreadsheetRows, tableCsv, tableXlsx } from '../table-export.js'
import { toast } from 'sonner'
import { currentLanguage, t } from '../i18n.js'
import { codeCopyHandler } from './code-copy.js'
import { blockIconMarkup, gripMarkup } from './block-icons.js'
import { openPopupMenu } from './popup-menu.js'
import { addBlockBelow } from './block-actions.js'
import { SheetCell } from './table-cell-content.js'
import { SheetEditor, sheetField } from './sheet.js'
import {
  decodeCell,
  normalizeRange,
  tableCellsWrapped,
  tableClearCells,
  tableToggleCellsWrap,
  tableValues,
  toTsv,
} from '../table-sheet.js'
import { evaluateTable, formatResult, parseNumber } from '../formula.js'
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
  tableSetAlignment,
} from '../table-navigation.js'

export const trashIconMarkup =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4M11.5 9v4" /></svg>'

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

// A row or column selection covers every index from `index` to `end`.
export function axisBounds(axis) {
  if (!axis) return null
  const end = axis.end ?? axis.index
  return [Math.min(axis.index, end), Math.max(axis.index, end)]
}

function axisIndexes(axis) {
  const [low, high] = axisBounds(axis)
  return Array.from({ length: high - low + 1 }, (_, i) => low + i)
}

export function axisHas(axis, kind, index) {
  if (axis?.kind !== kind) return false
  const [low, high] = axisBounds(axis)
  return index >= low && index <= high
}

// Shift extends the selection from its first row or column.
export function selectAxis(view, table, kind, index, extend = false) {
  const axis = view.state.field(tableUiField).axis
  const sameKind = axis?.table === table && axis.kind === kind
  const single = sameKind && axis.index === index && (axis.end ?? axis.index) === index
  view.dispatch({
    effects: setTableUi.of({
      axis:
        extend && sameKind
          ? { ...axis, end: index }
          : single
            ? null
            : { table, kind, index, end: index },
    }),
  })
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

// The cells a table menu acts on: the selected row or column, the selected
// cells, the clicked cell, or the whole table.
function menuTarget(view, table, { axis = null, cell = null } = {}) {
  const rows = table.last - table.first
  const key = view.state.doc.line(table.first).from
  if (axis) {
    const [low, high] = axisBounds(axis)
    return axis.kind === 'row'
      ? { top: low, bottom: high, left: 0, right: table.columnCount - 1, kind: 'row' }
      : { top: 0, bottom: rows - 1, left: low, right: high, kind: 'column' }
  }
  const sheet = view.state.field(sheetField, false)
  const own = sheet?.table === key ? normalizeRange(sheet) : null
  const inside = (box, item) =>
    item.row >= box.top &&
    item.row <= box.bottom &&
    item.column >= box.left &&
    item.column <= box.right
  if (own && (!cell || inside(own, cell))) return { ...own, kind: 'cells' }
  if (cell)
    return { top: cell.row, bottom: cell.row, left: cell.column, right: cell.column, kind: 'cells' }
  return { top: 0, bottom: rows - 1, left: 0, right: table.columnCount - 1, kind: 'table' }
}

const boxCells = (box) => {
  const cells = []
  for (let row = box.top; row <= box.bottom; row++)
    for (let column = box.left; column <= box.right; column++) cells.push([row, column])
  return cells
}

const boxRange = (box) => ({
  anchor: { row: box.top, column: box.left },
  head: { row: box.bottom, column: box.right },
})

function downloadTable(view, table, format) {
  try {
    const rows = spreadsheetRows(tableSource(view, table))
    const body = format === 'csv' ? tableCsv(rows) : tableXlsx(rows)
    const url = URL.createObjectURL(
      new Blob([body], {
        type:
          format === 'csv'
            ? 'text/csv;charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `tabela.${format}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    toast.error(t('table.exportFailed'))
  }
}

// Replaces the table lines, keeping a cell selected.
function editTable(view, tableFirst, change) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const lines = tableLines(view, table)
  const next = change(lines, table)
  if (!next || next.join('\n') === lines.join('\n')) return false
  return replaceTable(view, table, next, 0, 0, clearAxis())
}

function removeRowLines(lines, top, bottom) {
  let current = lines
  for (let row = bottom; row >= top; row--) {
    if (row === 0) {
      if (current.length <= 2) return null
      current = [current[2], current[1], ...current.slice(3)]
    } else current = tableRemoveRow(current, tableLineIndex(row))
  }
  return current
}

// The same menu opens from the table handle, a right click on a cell and the
// row and column bars. It acts on the selection; without one, on the whole table.
export function openTableMenu(view, tableFirst, anchor, options = {}) {
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return
  const flags = tableFlags(view.state.doc, table)
  const lines = tableLines(view, table)
  const box = menuTarget(view, table, options)
  const cells = boxCells(box)
  const rows = table.last - table.first
  const copyText = (text) => view.state.facet(codeCopyHandler)[0]?.(text)
  let point = null
  if (!anchor) {
    // A right click has no button to open from, so the menu opens at the pointer.
    point = document.createElement('span')
    point.className = 'cm-table-menu-point'
    point.style.cssText = `position:fixed;left:${options.x}px;top:${options.y}px;width:0;height:0`
    document.body.append(point)
  }
  const first = `${box.top}:${box.left}`
  const columnAlign = (column) => table.group.alignments[column] ?? null
  const cellAlign = ([row, column]) => flags.halign[`${row}:${column}`] ?? columnAlign(column)
  const same = (values) => (new Set(values).size === 1 ? values[0] : undefined)
  const horizontal = same(cells.map(cellAlign))
  const vertical = same(cells.map(([row, column]) => flags.valign[`${row}:${column}`] ?? 'top'))
  const wholeColumns = box.top === 0 && box.bottom === rows - 1
  const setHorizontal = (value) => {
    const next = horizontal === value ? null : value
    if (wholeColumns) {
      editTable(view, tableFirst, (current) => {
        let result = current
        for (let column = box.left; column <= box.right; column++) {
          const now = columnAlign(column)
          if (now !== next) result = tableSetAlignment(result, column, next ?? now)
        }
        return result
      })
      setTableCellsAlign(view, tableFirst, cells, 'halign', null)
    } else setTableCellsAlign(view, tableFirst, cells, 'halign', next)
  }
  const danger = (button) => {
    const on = (value) => view.contentDOM.classList.toggle('cm-table-danger', value)
    button.addEventListener('mouseenter', () => on(true))
    button.addEventListener('mouseleave', () => on(false))
    button.addEventListener('focus', () => on(true))
    button.addEventListener('blur', () => on(false))
    return button
  }
  openPopupMenu({
    view,
    anchor: anchor ?? point,
    label: t('table.actions'),
    onClose: () => {
      point?.remove()
      view.contentDOM.classList.remove('cm-table-danger')
    },
    build: (menu, { item, iconButton, grid, separator, close, submenu }) => {
      const disabled = (button, value) => {
        button.disabled = value
        return button
      }
      menu.append(
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
        submenu(menuIcons.palette, t('table.menu.colors'), (panel) =>
          panel.append(
            colorPalettePanel({
              value: { color: flags.textColors[first], background: flags.colors[first] },
              onChange: (property, color) => {
                close()
                setTableCellsColor(view, tableFirst, cells, property, color)
              },
              onReset: () => {
                close()
                setTableCellsColor(view, tableFirst, cells, 'reset')
              },
            }),
          ),
        ),
        submenu(menuIcons.align, t('table.menu.align'), (panel) => {
          const heading = (text) => {
            const label = document.createElement('div')
            label.className = 'table-context-menu-heading'
            label.textContent = text
            return label
          }
          panel.append(
            heading(t('table.menu.horizontal')),
            grid(
              t('table.menu.horizontal'),
              ['left', 'center', 'right'].map((value) =>
                iconButton(
                  menuIcons[`align${value[0].toUpperCase()}${value.slice(1)}`],
                  t(`table.align.${value}`),
                  () => setHorizontal(value),
                  { current: horizontal === value },
                ),
              ),
            ),
            heading(t('table.menu.vertical')),
            grid(
              t('table.menu.vertical'),
              ['top', 'middle', 'bottom'].map((value) =>
                iconButton(
                  menuIcons[`align${value[0].toUpperCase()}${value.slice(1)}`],
                  t(`table.menu.align${value[0].toUpperCase()}${value.slice(1)}`),
                  () =>
                    setTableCellsAlign(
                      view,
                      tableFirst,
                      cells,
                      'valign',
                      value === 'top' || vertical === value ? null : value,
                    ),
                  { current: vertical === value },
                ),
              ),
            ),
          )
        }),
        submenu(menuIcons.format, t('table.menu.format'), (panel) =>
          panel.append(
            ...tableMarkers.map(([name, marker, label]) =>
              item(
                menuIcons[name === 'code' ? 'inlineCode' : name],
                t(label),
                () =>
                  editTable(view, tableFirst, (current) =>
                    tableToggleCellsWrap(current, boxRange(box), marker),
                  ),
                { active: tableCellsWrapped(lines, boxRange(box), marker) },
              ),
            ),
          ),
        ),
        item(menuIcons.eraser, t('table.menu.clear'), () =>
          editTable(view, tableFirst, (current) => tableClearCells(current, boxRange(box))),
        ),
        separator(),
        submenu(menuIcons.add, t('table.menu.insert'), (panel) =>
          panel.append(
            item(menuIcons.rowAbove, t('table.menu.rowAbove'), () =>
              insertRowAtBoundary(view, tableFirst, box.top),
            ),
            item(menuIcons.rowBelow, t('table.menu.rowBelow'), () =>
              insertRowAtBoundary(view, tableFirst, box.bottom + 1),
            ),
            item(menuIcons.columnLeft, t('table.menu.columnLeft'), () =>
              insertColumnAtBoundary(view, tableFirst, box.left),
            ),
            item(menuIcons.columnRight, t('table.menu.columnRight'), () =>
              insertColumnAtBoundary(view, tableFirst, box.right + 1),
            ),
          ),
        ),
        separator(),
        submenu(menuIcons.trash, t('table.menu.remove'), (panel) =>
          panel.append(
            danger(
              disabled(
                item(
                  menuIcons.trash,
                  box.bottom > box.top
                    ? t('table.menu.removeRows', { count: box.bottom - box.top + 1 })
                    : t('table.removeRow'),
                  () =>
                    editTable(view, tableFirst, (current) =>
                      removeRowLines(current, box.top, box.bottom),
                    ),
                ),
                box.bottom - box.top + 1 >= rows,
              ),
            ),
            danger(
              disabled(
                item(
                  menuIcons.trash,
                  box.right > box.left
                    ? t('table.menu.removeColumns', { count: box.right - box.left + 1 })
                    : t('table.removeColumn'),
                  () =>
                    editTable(view, tableFirst, (current) => {
                      let result = current
                      for (let column = box.right; column >= box.left; column--)
                        result = tableRemoveColumn(result, column)
                      return result
                    }),
                ),
                box.right - box.left + 1 >= table.columnCount,
              ),
            ),
            danger(item(menuIcons.trash, t('table.delete'), () => deleteTable(view, table))),
          ),
        ),
        separator(),
        submenu(menuIcons.copy, t('table.menu.copy'), (panel) =>
          panel.append(
            item(menuIcons.copy, t('table.menu.copyCells'), () => {
              const values = tableValues(lines)
              const block = []
              for (let row = box.top; row <= box.bottom; row++)
                block.push(
                  values[row].slice(box.left, box.right + 1).map((value) => decodeCell(value)),
                )
              copyText(toTsv(block))
            }),
            item(menuIcons.copy, t('table.menu.copyTable'), () =>
              copyText(tableSource(view, table)),
            ),
            item(menuIcons.copy, t('table.menu.copyCsv'), () =>
              copyText(tableCsv(spreadsheetRows(tableSource(view, table)))),
            ),
            item(menuIcons.cut, t('table.cut'), () => {
              copyText(tableSource(view, table))
              deleteTable(view, table)
            }),
          ),
        ),
        submenu(menuIcons.export, t('table.menu.exportTitle'), (panel) =>
          panel.append(
            ...['csv', 'xlsx'].map((format) =>
              item(menuIcons.export, t('table.export', { format: format.toUpperCase() }), () =>
                downloadTable(view, table, format),
              ),
            ),
          ),
        ),
        separator(),
        separator(),
        item(menuIcons.reset, t('table.resetSizes'), () =>
          setTableFlags(view, tableFirst, { widths: [], heights: [] }),
        ),
        item(menuIcons.add, t('block.addBelow'), () => addBlockBelow(view, table.last)),
      )
    },
  })
}

// A row or column bar selects its row or column (Shift extends the selection)
// and opens the table menu for it.
function openAxisMenu(view, tableKey, tableFirst, kind, index, event) {
  const box = event.currentTarget?.getBoundingClientRect?.()
  selectAxis(view, tableKey, kind, index, event.shiftKey)
  const axis = view.state.field(tableUiField).axis
  if (!axis || !box) return
  openTableMenu(view, tableFirst, null, {
    axis,
    x: kind === 'row' ? box.right + 4 : box.left,
    y: kind === 'row' ? box.top : box.bottom + 4,
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
      this.rowCount === other.rowCount
    )
  }
  toDOM(view) {
    const root = document.createElement('span')
    root.className = 'cm-table-row-tools'
    root.contentEditable = 'false'
    const segment = tableButton(
      t('table.selectRow', { n: this.row + 1 }),
      `cm-table-bar-segment cm-table-row-segment${this.selected ? ' is-selected' : ''}`,
      (event) => openAxisMenu(view, this.tableKey, this.tableFirst, 'row', this.row, event),
      '',
    )
    Object.assign(segment.dataset, {
      axisKind: 'row',
      axisIndex: this.row,
      axisTable: this.tableKey,
    })
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
      String(this.selected) === String(other.selected)
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
      const selected = this.selected?.includes(column) ?? false
      const segment = tableButton(
        t('table.selectColumn', { n: column + 1 }),
        `cm-table-bar-segment cm-table-column-segment${selected ? ' is-selected' : ''}`,
        (event) => openAxisMenu(view, this.tableKey, this.tableFirst, 'column', column, event),
        '',
      )
      Object.assign(segment.dataset, {
        axisKind: 'column',
        axisIndex: column,
        axisTable: this.tableKey,
      })
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
      // Dragging over the bar selects every row or column it crosses.
      this.dragMove = (event) => {
        const drag = this.drag
        if (!drag || event.pointerId !== drag.pointerId) return
        const segment = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest?.('.cm-table-bar-segment')
        if (segment?.dataset.axisTable !== drag.table || segment.dataset.axisKind !== drag.kind)
          return
        const index = Number(segment.dataset.axisIndex)
        const axis = view.state.field(tableUiField).axis
        if (index === drag.index && !axis) return
        if (axis && (axis.end ?? axis.index) === index && axis.index === drag.index) return
        drag.moved = true
        view.dispatch({
          effects: setTableUi.of({
            axis: { table: Number(drag.table), kind: drag.kind, index: drag.index, end: index },
          }),
        })
      }
      this.dragEnd = () => {
        this.drag = null
        window.removeEventListener('pointermove', this.dragMove, true)
        window.removeEventListener('pointerup', this.dragEnd, true)
        window.removeEventListener('pointercancel', this.dragEnd, true)
      }
      this.down = (event) => {
        const segment = event.target.closest?.('.cm-table-bar-segment')
        if (segment && event.button === 0 && !event.shiftKey && view.dom.contains(segment)) {
          this.drag = {
            pointerId: event.pointerId,
            table: segment.dataset.axisTable,
            kind: segment.dataset.axisKind,
            index: Number(segment.dataset.axisIndex),
          }
          window.addEventListener('pointermove', this.dragMove, true)
          window.addEventListener('pointerup', this.dragEnd, true)
          window.addEventListener('pointercancel', this.dragEnd, true)
        }
        if (!view.state.field(tableUiField).axis) return
        if (event.target.closest?.('.cm-table-bar-segment, .editor-popup-menu')) return
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
      this.dragEnd()
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

export const tableUi = [
  tableUiField,
  tableUiPlugin,
  tableResize({ tableAt, tableFlags, setTableFlags }),
]

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

export const TABLE_CELL_COLORS = BACKGROUND_COLORS

function parseSizes(value, min, max) {
  if (!value || !/^[\d,]+$/.test(value)) return []
  return value
    .split(',')
    .map(Number)
    .map((size) => (Number.isSafeInteger(size) && size >= min && size <= max ? size : 0))
}

function parseCellColors(words, key, allowed) {
  return Object.fromEntries(
    (
      words
        .find((word) => word.startsWith(`${key}=`))
        ?.slice(key.length + 1)
        .split(',') ?? []
    )
      .filter((entry) => /^\d+:\d+:[\w-]+$/.test(entry) && allowed.includes(entry.split(':')[2]))
      .map((entry) => {
        const [row, column, color] = entry.split(':')
        return [`${row}:${column}`, color]
      }),
  )
}

const cellColorWord = (key, colors) =>
  Object.keys(colors).length
    ? [
        `${key}=${Object.entries(colors)
          .map(([cell, color]) => `${cell}:${color}`)
          .join(',')}`,
      ]
    : []

export function tableFlags(doc, table) {
  const line = tableFlagsLine(doc, table)
  const words = line ? line.text.match(TABLE_FLAGS)[1].trim().split(/\s+/) : []
  return {
    colors: parseCellColors(words, 'colors', BACKGROUND_COLORS),
    textColors: parseCellColors(
      words,
      'text',
      TEXT_COLORS.filter((color) => color !== 'default'),
    ),
    halign: parseCellColors(words, 'halign', ['left', 'center', 'right']),
    valign: parseCellColors(words, 'valign', ['middle', 'bottom']),
    widths: parseSizes(words.find((word) => word.startsWith('widths='))?.slice(7), 1, 10000),
    heights: parseSizes(words.find((word) => word.startsWith('heights='))?.slice(8), 28, 1200),
    headerRow: !words.includes('no-header-row'),
    headerColumn: words.includes('header-column'),
  }
}

// Sets the horizontal ('halign') or vertical ('valign') alignment of cells;
// null goes back to the column alignment or to the top.
export function setTableCellsAlign(view, tableFirst, cells, property, value) {
  if (view.state.readOnly) return false
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const current = { ...tableFlags(view.state.doc, table)[property] }
  for (const [row, column] of cells) {
    if (value) current[`${row}:${column}`] = value
    else delete current[`${row}:${column}`]
  }
  return setTableFlags(view, tableFirst, { [property]: current })
}

export function setTableCellColor(view, tableFirst, row, column, color) {
  return setTableCellsColor(view, tableFirst, [[row, column]], 'background', color)
}

// Sets the text or background color of many cells in one change; 'reset'
// removes both colors.
export function setTableCellsColor(view, tableFirst, cells, property, color) {
  if (view.state.readOnly) return false
  if (property === 'background' && !TABLE_CELL_COLORS.includes(color)) return false
  if (property === 'color' && !TEXT_COLORS.includes(color)) return false
  const table = tableAt(view.state.doc, tableFirst)
  if (!table) return false
  const flags = tableFlags(view.state.doc, table)
  const colors = { ...flags.colors }
  const textColors = { ...flags.textColors }
  for (const [row, column] of cells) {
    const key = `${row}:${column}`
    if (property !== 'color') {
      if (property === 'reset' || color === 'none') delete colors[key]
      else colors[key] = color
    }
    if (property !== 'background') {
      if (property === 'reset' || color === 'default') delete textColors[key]
      else textColors[key] = color
    }
  }
  return setTableFlags(view, tableFirst, { colors, textColors })
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
    ...cellColorWord('colors', flags.colors),
    ...cellColorWord('text', flags.textColors),
    ...cellColorWord('halign', flags.halign),
    ...cellColorWord('valign', flags.valign),
    ...(flags.widths?.some(Boolean) ? [`widths=${flags.widths.join(',')}`] : []),
    ...(flags.heights?.some(Boolean) ? [`heights=${flags.heights.join(',')}`] : []),
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
  // The comment goes before the first row, so the table's key moves with it
  // and its hover and row or column selection stay on.
  const key = doc.line(table.first).from
  const moved = view.state.changes(changes).mapPos(key, 1)
  const ui = view.state.field(tableUiField, false)
  const effects =
    ui && (ui.hover === key || ui.axis?.table === key)
      ? setTableUi.of({
          hover: ui.hover === key ? moved : ui.hover,
          axis: ui.axis?.table === key ? { ...ui.axis, table: moved } : ui.axis,
        })
      : []
  view.dispatch({ changes, effects, userEvent: 'formatacao' })
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

// Formula results of a table, computed once per table text.
const formulaCache = new Map()
function formulaResults(state, table) {
  const lines = []
  for (let number = table.first; number <= table.last; number++)
    lines.push(state.doc.line(number).text)
  const text = lines.join('\n')
  if (!/(^|[^\\])\|\s*=/.test(text)) return []
  if (formulaCache.has(text)) return formulaCache.get(text)
  const results = evaluateTable(tableValues(lines))
  formulaCache.set(text, results)
  if (formulaCache.size > 50) formulaCache.delete(formulaCache.keys().next().value)
  return results
}

export function tableDecorations(ranges, view, line, number, table) {
  const row = number - table.first
  const doc = view.state.doc
  const tableKey = doc.line(table.first).from
  const tableEnd = doc.line(table.last).to
  const ui = view.state.field(tableUiField, false) ?? { hover: null, axis: null }
  const axis = ui.axis?.table === tableKey ? ui.axis : null
  const head = view.state.selection.main.head
  const focused =
    ui.hover === tableKey ||
    Boolean(axis) ||
    view.state.field(sheetField, false)?.table === tableKey ||
    (head >= tableKey && head <= tableEnd)
  const visualRow = row === 0 ? 0 : row - 1
  const rowCount = table.last - table.first
  const rowSelected = axisHas(axis, 'row', visualRow)
  const flags = tableFlags(doc, table)
  const editable = !view.state.readOnly
  const last = number === table.last || (table.last === table.first + 1 && number === table.first)
  ranges.push(
    Decoration.line({
      attributes: {
        class: `cm-md-table-row${row === 0 ? ' cm-md-table-head' : ''}${row === 0 && flags.headerRow ? ' cm-md-table-headrow' : ''}${last ? ' cm-md-table-last' : ''}${focused && editable ? ' cm-md-table-focus' : ''}${rowSelected ? ' cm-table-row-selected' : ''}`,
        style: `--table-columns:${table.columnCount};--table-tracks:${Array.from({ length: table.columnCount }, (_, i) => `minmax(0, ${flags.widths[i] || 100}fr)`).join(' ')}`,
        'data-table': String(tableKey),
      },
    }).range(line.from),
  )
  if (row === 0 && editable) {
    const columns = axis?.kind === 'column' ? axisIndexes(axis) : null
    ranges.push(
      Decoration.widget({
        widget: new TableColumnControlsWidget({
          tableKey,
          tableFirst: table.first,
          columnCount: table.columnCount,
          rowCount,
          selected: columns,
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
        }),
        side: -1,
      }).range(line.from + firstCell.rawFrom),
    )
  const cellClass = (column) =>
    `${flags.colors[`${visualRow}:${column}`] ? ` cm-table-bg-${flags.colors[`${visualRow}:${column}`]}` : ''}${flags.textColors[`${visualRow}:${column}`] ? ` cm-table-fg-${flags.textColors[`${visualRow}:${column}`]}` : ''}${axisHas(axis, 'column', column) ? ' cm-table-axis-selected' : ''}${flags.headerColumn && column === 0 ? ' cm-md-table-headcell' : ''}`
  const sheet = editable ? view.state.field(sheetField, false) : null
  const own = sheet?.table === tableKey ? sheet : null
  const bounds = own && normalizeRange(own)
  const results = formulaResults(view.state, table)
  let cursor = 0
  for (let column = 0; column < table.columnCount; column++) {
    const cell = tableCellAtColumn(parsed, column)
    if (cursor < cell.rawFrom)
      ranges.push(
        Decoration.mark({ class: 'cm-md-table-source' }).range(
          line.from + cursor,
          line.from + cell.rawFrom,
        ),
      )
    const align = flags.halign[`${visualRow}:${column}`] ?? table.group.alignments[column]
    const valign = flags.valign[`${visualRow}:${column}`]
    const result = results[visualRow]?.[column]
    const shown = result ? formatResult(result, currentLanguage()) : null
    const numeric = result
      ? typeof result.value === 'number'
      : parseNumber(cell.value) != null && !/^0\d/.test(cell.value.trim())
    const inRange =
      bounds &&
      visualRow >= bounds.top &&
      visualRow <= bounds.bottom &&
      column >= bounds.left &&
      column <= bounds.right
    const multiple = bounds && (bounds.top !== bounds.bottom || bounds.left !== bounds.right)
    // The outer edges of a selected range get a border, so the range reads on any background.
    const edges =
      inRange && multiple
        ? [
            visualRow === bounds.top && 'top',
            visualRow === bounds.bottom && 'bottom',
            column === bounds.left && 'left',
            column === bounds.right && 'right',
          ]
            .filter(Boolean)
            .join(' ')
        : ''
    const attributes = {
      ...tableCellAttributes(
        cell,
        row === 0,
        false,
        line.from,
        table.columnCount,
        align,
        `${cellClass(column)} cm-table-rich-cell${inRange && multiple ? ' cm-sheet-selected' : ''}${own && own.head.row === visualRow && own.head.column === column ? ' cm-sheet-cursor' : ''}${result?.error ? ' cm-table-formula-error' : ''}`,
      ),
      'data-row': String(visualRow),
      ...(valign ? { 'data-valign': valign } : {}),
      ...(edges ? { 'data-range-edge': edges } : {}),
      ...(numeric && !align ? { 'data-numeric': 'true' } : {}),
      ...(result
        ? {
            title: result.error
              ? t('table.formulaError', {
                  formula: cell.value,
                  reason: t(`formula.error.${result.error}`),
                })
              : cell.value,
          }
        : {}),
    }
    const editing =
      own?.editing && own.editing.row === visualRow && own.editing.column === column
        ? own.editing
        : null
    const widget = editing
      ? new SheetEditor({
          key: `${tableKey}:${visualRow}:${column}:${editing.text ?? ''}`,
          source: cell.value,
          attributes,
          editing,
        })
      : new SheetCell({
          source: cell.value,
          from: line.from + cell.from,
          attributes,
          readOnly: view.state.readOnly,
          result: shown,
        })
    ranges.push(
      cell.rawTo > cell.rawFrom
        ? Decoration.replace({ widget }).range(line.from + cell.rawFrom, line.from + cell.rawTo)
        : Decoration.widget({ widget, side: 1 }).range(line.from + cell.rawFrom),
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

// Shift+Enter breaks the line inside a cell with <br>. In a list or task
// item it starts the next item; on an empty item it ends the list.
export function insertCellBreak(view, context) {
  const { line, cell } = context
  // In the spaces before the next pipe, the break goes right after the text,
  // so a space stays between the new item and the pipe.
  const end = line.from + cell.to
  const main = view.state.selection.main
  const range =
    main.empty && main.head > end && cell.to > cell.from ? EditorSelection.cursor(end) : main
  const segmentFrom =
    line.from +
    cell.from +
    (() => {
      const before = line.text.slice(cell.from, range.from - line.from)
      const breaks = [...before.matchAll(/<br\s*\/?\s*>/gi)]
      const last = breaks.at(-1)
      return last ? last.index + last[0].length : 0
    })()
  const segment = view.state.doc.sliceString(segmentFrom, range.from)
  const item = /^\s*(?:([-*+])\s+(\[[ xX]\]\s+)?|(\d+)([.)])\s+)/.exec(segment)
  if (item && range.empty && !segment.slice(item[0].length).trim()) {
    view.dispatch({
      changes: { from: segmentFrom, to: range.from },
      selection: EditorSelection.single(segmentFrom),
      userEvent: 'input',
    })
    return true
  }
  const marker = !item
    ? ''
    : item[3]
      ? `${Number(item[3]) + 1}${item[4]} `
      : `${item[1]} ${item[2] ? '[ ] ' : ''}`
  const insert = `<br>${marker}`
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.single(range.from + insert.length),
    userEvent: 'input',
    scrollIntoView: true,
  })
  return true
}

export function moveTable(view, action) {
  if (view.composing) return false
  const context = tableContextAt(view)
  if (!context) return false
  if (action === 'shift-enter') return view.state.readOnly ? false : insertCellBreak(view, context)
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
