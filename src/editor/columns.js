import { EditorState, Facet, Prec, StateField } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
  drawSelection,
  dropCursor,
  keymap,
  placeholder,
} from '@codemirror/view'
import { defaultKeymap, undo, redo } from '@codemirror/commands'
import { foldField } from './folding.js'
import { columnBlocks } from '../columns.js'
import { t } from '../i18n.js'
import { clipboardImageFiles } from '../clipboard.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Markdown } from '../markdown.jsx'
import { liveMarkdown, taskNotes } from './live-decorations.js'
import { openExternalLink } from '../external-links.js'
import { toast } from 'sonner'
import { searchHighlights, setSearchHighlights } from './search.js'
import { documentChanges } from '../search-scope.js'
import { columnHosts, embeddedDocument } from './embedded.js'
import { blockGaps } from './block-gaps.js'
import { blockHandle } from './block-handle.js'
import { documentColors } from './document-colors.js'
import { codeCopyHandler, codeFold, codeWrap, stickyCodeCopy } from './code-copy.js'
import { continueList, indentList } from './keys.js'
import { addColumn, removeColumn, unwrapColumns } from '../column-drop.js'
import { blockIconMarkup } from './block-icons.js'

export const columnImageHandler = Facet.define()
export const columnReadServices = Facet.define()

let dragged = null
const searchByView = new WeakMap()

/** The editor of column `index` in the columns block that starts at `from`. */
function columnView(parent, from, index) {
  return parent.dom.querySelector(`[data-columns-from="${from}"]`)?.columnContext?.views[index]
}

/**
 * Replaces the note's text with `next` in one undoable step. Then puts the cursor at `selection`
 * in the note, or runs `focus` once the columns are drawn again.
 */
function editNote(parent, next, selection, focus) {
  if (next == null) return false
  parent.dispatch({
    changes: documentChanges(parent.state.doc.toString(), next),
    ...(selection ? { selection } : {}),
    userEvent: 'bloco',
    scrollIntoView: true,
  })
  if (focus) requestAnimationFrame(focus)
  else parent.focus()
  return true
}

/**
 * The arrow key on the first (up) or last (down) line of a column goes to the note's text above
 * or below the columns. Below the last columns of a note, it opens an empty paragraph there.
 */
function leaveColumn(context, direction) {
  return (view) => {
    const range = view.state.selection.main
    if (view.state.selection.ranges.length !== 1) return false
    const line = view.state.doc.lineAt(range.head)
    if (line.number !== (direction < 0 ? 1 : view.state.doc.lines)) return false
    // A long line wraps: the arrow moves through its rows first.
    const side = direction < 0 ? 1 : -1
    const here = view.coordsAtPos(range.head, side)
    const edge = view.coordsAtPos(direction < 0 ? line.from : line.to, side)
    const middle = (box) => (box.top + box.bottom) / 2
    if (here && edge && Math.abs(middle(here) - middle(edge)) > view.defaultLineHeight / 2)
      return false
    const { parent, block } = context
    const doc = parent.state.doc
    let number = doc.lineAt(direction < 0 ? block.from : block.to).number + direction
    while (number >= 1 && number <= doc.lines && !doc.line(number).text.trim()) number += direction
    parent.focus()
    if (number > doc.lines) {
      const end = doc.length
      const insert = doc.sliceString(end - 1) === '\n' ? '\n' : '\n\n'
      parent.dispatch({
        changes: { from: end, insert },
        selection: { anchor: end + insert.length },
        userEvent: 'input',
        scrollIntoView: true,
      })
      return true
    }
    if (number < 1) return true
    const target = doc.line(number)
    parent.dispatch({
      selection: { anchor: direction < 0 ? target.to : target.from },
      scrollIntoView: true,
    })
    return true
  }
}

/** In the note, an arrow key that would pass over columns goes into the first column. */
function enterColumns(direction) {
  return (view) => {
    const range = view.state.selection.main
    if (view.state.selection.ranges.length !== 1 || !range.empty) return false
    const moved = view.moveVertically(range, direction > 0)
    for (const root of view.dom.querySelectorAll('.cm-columns')) {
      const context = root.columnContext
      if (!context || context.parent !== view || context.readOnly) continue
      const { from, to } = context.block
      if (range.head >= from && range.head <= to) continue
      const lands = moved.head >= from && moved.head <= to
      const passes =
        direction > 0 ? range.head < from && moved.head > to : range.head > to && moved.head < from
      if (!lands && !passes) continue
      const target = context.views[0]
      if (!target) return false
      target.focus()
      target.dispatch({
        // At the end of the column's first line (coming from above) or of its last line.
        selection: {
          anchor: direction > 0 ? target.state.doc.line(1).to : target.state.doc.length,
        },
        scrollIntoView: true,
      })
      return true
    }
    return false
  }
}

export const columnArrowKeys = Prec.high(
  keymap.of([
    { key: 'ArrowDown', run: enterColumns(1) },
    { key: 'ArrowUp', run: enterColumns(-1) },
  ]),
)

export function columnViewAt(element) {
  const cell = element?.closest?.('.cm-column-editor')
  const root = cell?.closest('.cm-columns')
  if (!cell || !root?.columnContext) return null
  const index = [...root.querySelectorAll(':scope > .cm-columns-grid > .cm-column-editor')].indexOf(
    cell,
  )
  return root.columnContext.views[index] ?? null
}

export function columnSelectionAt(element, parent) {
  const view = columnViewAt(element)
  const root = element?.closest?.('.cm-columns')
  const context = root?.columnContext
  if (!view || context?.parent !== parent) return null
  const index = context.views.indexOf(view)
  const column = context.block.columns[index]
  if (!column) return null
  const selection = view.state.selection.main
  return { from: column.from + selection.from, to: column.from + selection.to }
}

function applyHighlights(context, payload) {
  if (!payload || context.readOnly) return
  context.views.forEach((view, index) => {
    const column = context.block.columns[index]
    const matches = payload.matches.filter(
      (match) => match.start >= column.from && match.end <= column.to,
    )
    const current = payload.matches[payload.index]
    const local = matches.map((match) => ({
      start: match.start - column.from,
      end: match.end - column.from,
    }))
    const scope = payload.scope && {
      from: Math.max(0, payload.scope.from - column.from),
      to: Math.min(column.to - column.from, payload.scope.to - column.from),
    }
    view.dispatch({
      effects: setSearchHighlights.of({ matches: local, index: matches.indexOf(current), scope }),
    })
  })
}

export function setColumnHighlights(parent, payload) {
  searchByView.set(parent, payload)
  for (const root of parent.dom.querySelectorAll('.cm-columns'))
    if (root.columnContext?.parent === parent) applyHighlights(root.columnContext, payload)
}

export function revealColumnMatch(parent, match) {
  const block = columnBlocks(parent.state.doc.toString()).find((item) =>
    item.columns.some((column) => match.start >= column.from && match.end <= column.to),
  )
  if (!block) return false
  parent.dispatch({ effects: EditorView.scrollIntoView(block.from, { y: 'center' }) })
  requestAnimationFrame(() => {
    const root = parent.dom.querySelector(`[data-columns-from="${block.from}"]`)
    const context = root?.columnContext
    const index =
      context?.block.columns.findIndex(
        (column) => match.start >= column.from && match.end <= column.to,
      ) ?? -1
    const view = context?.views[index]
    const column = context?.block.columns[index]
    if (!view || !column) return
    applyHighlights(context, searchByView.get(parent))
    view.dispatch({
      selection: { anchor: match.start - column.from, head: match.end - column.from },
      effects: EditorView.scrollIntoView(match.start - column.from, { y: 'center' }),
    })
    view.requestMeasure({
      read: () => view.coordsAtPos(match.start - column.from),
      write: (coords) => {
        if (!coords) return
        const top =
          Math.max(
            document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0,
            document.querySelector('.find-dialog')?.getBoundingClientRect().bottom ?? 0,
          ) + 24
        const bottom = window.innerHeight - 70
        if (coords.top < top || coords.bottom > bottom)
          window.scrollBy({ top: coords.top - (top + bottom) / 2, behavior: 'instant' })
      },
    })
  })
  return true
}

function moveText(parent, source, target) {
  if (
    parent.state.readOnly ||
    source.parent !== parent ||
    parent.state.doc.sliceString(source.from, source.to) !== source.text ||
    (target >= source.from && target <= source.to)
  )
    return null
  const changes = parent.state.changes([
    { from: source.from, to: source.to },
    { from: target, insert: source.text },
  ])
  parent.dispatch({ changes, userEvent: 'move.drop' })
  return changes
}

function pointerDrag(event, context, index, view) {
  if (
    event.pointerType !== 'mouse' ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    context.parent.state.readOnly ||
    view.state.selection.ranges.length !== 1
  )
    return false
  const selection = view.state.selection.main
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
  const column = index == null ? null : context.block.columns[index]
  if (
    (index != null && !column) ||
    selection.empty ||
    position == null ||
    position < selection.from ||
    position >= selection.to
  )
    return false
  event.preventDefault()
  event.stopPropagation()
  const parent = context.parent
  const offset = column?.from ?? 0
  const source = {
    parent,
    from: offset + selection.from,
    to: offset + selection.to,
    text: view.state.sliceDoc(selection.from, selection.to),
  }
  const start = { x: event.clientX, y: event.clientY }
  let target = null,
    moved = false
  const marker = document.createElement('div')
  marker.className = 'cm-column-drop-marker'
  marker.hidden = true
  document.body.append(marker)
  const cleanup = () => {
    marker.remove()
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', end, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('blur', cancel, true)
  }
  const move = (next) => {
    if (next.pointerId !== event.pointerId) return
    if (!moved && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 5) return
    moved = true
    const element = document.elementFromPoint(next.clientX, next.clientY)
    const root = element?.closest('.cm-columns')
    const dest = root?.columnContext
    const cell = element?.closest('.cm-column-editor')
    const destIndex =
      cell && root
        ? [...root.querySelectorAll(':scope > .cm-columns-grid > .cm-column-editor')].indexOf(cell)
        : -1
    const destView = dest?.parent === parent && destIndex >= 0 ? dest.views[destIndex] : null
    const inner = destView?.posAtCoords({ x: next.clientX, y: next.clientY }, false)
    if (destView && inner != null) {
      target = {
        from: dest.block.columns[destIndex].from + inner,
        blockFrom: dest.block.from,
        index: destIndex,
      }
    } else if (element && parent.contentDOM.contains(element) && !root) {
      const pos = parent.posAtCoords({ x: next.clientX, y: next.clientY })
      target = pos == null ? null : { from: pos }
    } else target = null
    const coords =
      destView && inner != null
        ? destView.coordsAtPos(inner)
        : target
          ? parent.coordsAtPos(target.from)
          : null
    marker.hidden = !coords
    if (coords) {
      marker.style.left = `${coords.left}px`
      marker.style.top = `${coords.top}px`
      marker.style.height = `${coords.bottom - coords.top}px`
    }
  }
  const end = (next) => {
    if (next.pointerId !== event.pointerId) return
    cleanup()
    if (!parent.dom.isConnected || !view.dom.isConnected) return
    if (!moved) {
      view.dispatch({ selection: { anchor: position } })
      view.focus()
      return
    }
    if (!target) return
    const changes = moveText(parent, source, target.from)
    if (!changes) return
    requestAnimationFrame(() => {
      const anchor = changes.mapPos(target.from, -1)
      if (target.index == null) {
        parent.dispatch({ selection: { anchor, head: anchor + source.text.length } })
        parent.focus()
        return
      }
      const root = parent.dom.querySelector(
        `[data-columns-from="${changes.mapPos(target.blockFrom, -1)}"]`,
      )
      const nextView = root?.columnContext?.views[target.index]
      const nextColumn = root?.columnContext?.block.columns[target.index]
      if (!nextView || !nextColumn) return
      const local = Math.max(0, Math.min(nextView.state.doc.length, anchor - nextColumn.from))
      nextView.dispatch({
        selection: {
          anchor: local,
          head: Math.min(nextView.state.doc.length, local + source.text.length),
        },
      })
      nextView.focus()
    })
  }
  const cancel = () => cleanup()
  const key = (next) => {
    if (next.key === 'Escape') cancel()
  }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', end, true)
  window.addEventListener('pointercancel', cancel, true)
  window.addEventListener('keydown', key, true)
  window.addEventListener('blur', cancel, true)
  return true
}

// The parent and each column are separate views of one document. Record the
// source so a cross-view drop moves both ranges in one undoable transaction.
export const columnDrag = EditorView.domEventHandlers({
  pointerdown(event, view) {
    if (!view.dom.querySelector('.cm-columns') || event.target.closest?.('.cm-columns, button, a'))
      return false
    return pointerDrag(event, { parent: view }, null, view)
  },
  dragstart(_event, view) {
    const range = view.state.selection.main
    if (!range.empty)
      dragged = {
        parent: view,
        from: range.from,
        to: range.to,
        text: view.state.sliceDoc(range.from, range.to),
        column: false,
      }
    return false
  },
  dragend() {
    dragged = null
    return false
  },
  drop(event, view) {
    if (!dragged?.column || dragged.parent !== view || view.state.readOnly) return false
    const target = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (target == null) return false
    const source = dragged
    dragged = null
    event.preventDefault()
    event.stopPropagation()
    const changes = moveText(view, source, target)
    if (changes) {
      const anchor = changes.mapPos(target, -1)
      view.dispatch({
        selection: { anchor, head: anchor + source.text.length },
        scrollIntoView: true,
      })
      view.focus()
    }
    return true
  },
})

class ColumnsWidget extends WidgetType {
  constructor(block, readOnly, notes) {
    super()
    this.block = block
    this.readOnly = readOnly
    this.notes = notes
  }
  eq(other) {
    return (
      this.readOnly === other.readOnly &&
      this.notes === other.notes &&
      this.block.from === other.block.from &&
      this.block.columns.length === other.block.columns.length &&
      this.block.columns.every(
        (column, index) =>
          column.text === other.block.columns[index].text &&
          column.from === other.block.columns[index].from,
      )
    )
  }
  toDOM(parent) {
    const root = document.createElement('div')
    root.className = 'cm-columns'
    root.dataset.columnsFrom = String(this.block.from)
    root.contentEditable = 'false'
    root.setAttribute('role', 'group')
    root.setAttribute('aria-label', t('columns.group'))
    const grid = document.createElement('div')
    grid.className = 'cm-columns-grid'
    root.append(grid)
    const context = {
      parent,
      block: this.block,
      views: [],
      previews: [],
      syncing: false,
      readOnly: this.readOnly,
    }
    root.columnContext = context
    this.block.columns.forEach((column, index) => {
      const element = document.createElement('div')
      element.className = this.readOnly ? 'cm-column-preview' : 'cm-column-editor'
      grid.append(element)
      if (this.readOnly) {
        const preview = createRoot(element)
        context.previews.push(preview)
        this.renderPreview(context, index, preview)
        element.addEventListener('click', (event) => {
          const link = event.target.closest?.('a')
          const href = link?.getAttribute('href') ?? ''
          if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
            event.preventDefault()
            openExternalLink(href).catch((error) => toast.error(String(error)))
          }
        })
        return
      }
      const runHistory = (action) => {
        const selection = context.views[index]?.state.selection.main
        const anchor = context.block.from
        const changed = action(parent)
        if (changed)
          requestAnimationFrame(() => {
            const candidates = [...parent.dom.querySelectorAll('.cm-columns')]
            const nearest = candidates.sort(
              (a, b) =>
                Math.abs(Number(a.dataset.columnsFrom) - anchor) -
                Math.abs(Number(b.dataset.columnsFrom) - anchor),
            )[0]
            const next = nearest?.columnContext?.views[index]
            if (!next) return
            if (selection)
              next.dispatch({
                selection: {
                  anchor: Math.min(selection.anchor, next.state.doc.length),
                  head: Math.min(selection.head, next.state.doc.length),
                },
              })
            next.focus()
          })
        return changed
      }
      const view = new EditorView({
        parent: element,
        state: EditorState.create({
          doc: column.text,
          extensions: [
            EditorState.readOnly.of(this.readOnly),
            EditorView.editable.of(!this.readOnly),
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({
              'aria-label': t('columns.label', { number: index + 1 }),
            }),
            placeholder(t('columns.placeholder')),
            // The same writing as in the note: formatted Markdown, the standard gap between
            // blocks, block handles, colors, and Enter and Tab on lists.
            embeddedDocument.of(true),
            taskNotes.of(parent.state.facet(taskNotes)),
            codeCopyHandler.of((text) => parent.state.facet(codeCopyHandler)[0]?.(text)),
            codeFold,
            codeWrap,
            stickyCodeCopy,
            foldField,
            documentColors,
            blockGaps,
            liveMarkdown,
            blockHandle,
            Prec.high(
              keymap.of([
                { key: 'Enter', run: continueList },
                { key: 'Tab', run: (view) => indentList(view) },
                { key: 'Shift-Tab', run: (view) => indentList(view, true) },
                { key: 'ArrowUp', run: leaveColumn(context, -1) },
                { key: 'ArrowDown', run: leaveColumn(context, 1) },
                {
                  // In an empty column, Backspace removes the column.
                  key: 'Backspace',
                  run: (view) => {
                    if (view.state.doc.length || !view.state.selection.main.empty) return false
                    const { block } = context
                    const next = removeColumn(parent.state.doc.toString(), block.from, index)
                    if (block.columns.length <= 2)
                      return editNote(parent, next, { anchor: block.from })
                    return editNote(parent, next, null, () => {
                      const previous = columnView(parent, block.from, Math.max(0, index - 1))
                      previous?.focus()
                      previous?.dispatch({ selection: { anchor: previous.state.doc.length } })
                    })
                  },
                },
              ]),
            ),
            drawSelection(),
            dropCursor(),
            searchHighlights,
            EditorView.domEventHandlers({
              paste(event, view) {
                const files = clipboardImageFiles(event.clipboardData)
                const column = context.block.columns[index]
                if (!files.length || !column || parent.state.readOnly) return false
                const selection = view.state.selection.main
                event.preventDefault()
                event.stopPropagation()
                parent.state.facet(columnImageHandler)[0]?.(files, {
                  from: column.from + selection.from,
                  to: column.from + selection.to,
                })
                return true
              },
              pointerdown(event, view) {
                return pointerDrag(event, context, index, view)
              },
              dragstart(_event, view) {
                const range = view.state.selection.main
                const column = context.block.columns[index]
                if (!range.empty && column)
                  dragged = {
                    parent,
                    from: column.from + range.from,
                    to: column.from + range.to,
                    text: view.state.sliceDoc(range.from, range.to),
                    column: true,
                    view,
                  }
                return false
              },
              dragend() {
                dragged = null
                return false
              },
              drop(event, view) {
                if (
                  !dragged ||
                  dragged.parent !== parent ||
                  dragged.view === view ||
                  parent.state.readOnly
                )
                  return false
                const targetPos = view.posAtCoords({ x: event.clientX, y: event.clientY })
                const column = context.block.columns[index]
                if (targetPos == null || !column) return false
                const source = dragged
                dragged = null
                event.preventDefault()
                event.stopPropagation()
                const blockFrom = context.block.from
                const target = column.from + targetPos
                const changes = moveText(parent, source, target)
                if (changes)
                  requestAnimationFrame(() => {
                    const from = changes.mapPos(blockFrom, -1)
                    const root = parent.dom.querySelector(`[data-columns-from="${from}"]`)
                    const next = root?.columnContext?.views[index]
                    const nextColumn = root?.columnContext?.block.columns[index]
                    if (!next || !nextColumn) return
                    const position = Math.max(
                      0,
                      Math.min(next.state.doc.length, changes.mapPos(target, -1) - nextColumn.from),
                    )
                    next.dispatch({
                      selection: {
                        anchor: position,
                        head: Math.min(next.state.doc.length, position + source.text.length),
                      },
                    })
                    next.focus()
                  })
                return true
              },
              keydown(event) {
                if (
                  !(event.ctrlKey || event.metaKey) ||
                  event.altKey ||
                  !['z', 'y'].includes(event.key.toLowerCase())
                )
                  return false
                event.preventDefault()
                event.stopPropagation()
                runHistory(event.shiftKey || event.key.toLowerCase() === 'y' ? redo : undo)
                return true
              },
            }),
            keymap.of([...defaultKeymap]),
            EditorView.updateListener.of((update) => {
              if (!update.docChanged || context.syncing) return
              const current = context.block.columns[index]
              if (!current) return
              const changes = []
              update.changes.iterChanges((from, to, _fromNew, _toNew, inserted) => {
                changes.push({ from: current.from + from, to: current.from + to, insert: inserted })
              })
              parent.dispatch({ changes, userEvent: 'input.type' })
            }),
          ],
        }),
      })
      columnHosts.set(view, { context, index })
      context.views.push(view)
    })
    applyHighlights(context, searchByView.get(parent))
    if (!this.readOnly) {
      // Two small buttons over the top right corner, shown while the pointer or the focus is in
      // the columns: add a column, or turn the columns back into blocks one under another.
      const controls = document.createElement('div')
      controls.className = 'cm-columns-controls'
      root.append(controls)
      const button = (className, icon, label, action) => {
        const element = document.createElement('button')
        element.type = 'button'
        element.className = className
        element.setAttribute('aria-label', label)
        element.title = label
        element.innerHTML = icon
        element.addEventListener('mousedown', (event) => event.preventDefault())
        element.addEventListener('click', action)
        controls.append(element)
      }
      button('cm-add-column', blockIconMarkup.add, t('columns.add'), () => {
        const { from, columns } = context.block
        editNote(parent, addColumn(parent.state.doc.toString(), from), null, () =>
          columnView(parent, from, columns.length)?.focus(),
        )
      })
      button('cm-remove-columns', blockIconMarkup.unwrap, t('columns.remove'), () =>
        editNote(parent, unwrapColumns(parent.state.doc.toString(), context.block.from), {
          anchor: context.block.from,
        }),
      )
    }
    return root
  }
  renderPreview(context, index, preview) {
    const column = context.block.columns[index]
    const services = context.parent.state.facet(columnReadServices)[0] ?? {}
    preview.render(
      React.createElement(Markdown, {
        text: column.text,
        notes: context.parent.state.facet(taskNotes),
        onCopy: services.onCopy,
        onOpenWiki: services.onOpenWiki,
        onChange: (text) => {
          const current = context.block.columns[index]
          if (current)
            context.parent.dispatch({
              changes: { from: current.from, to: current.to, insert: text },
              userEvent: 'tarefa',
            })
        },
      }),
    )
  }
  updateDOM(root) {
    const context = root.columnContext
    if (
      !context ||
      (context.readOnly ? context.previews.length : context.views.length) !==
        this.block.columns.length ||
      context.readOnly !== this.readOnly
    )
      return false
    context.block = this.block
    root.dataset.columnsFrom = String(this.block.from)
    if (context.readOnly) {
      context.previews.forEach((preview, index) => this.renderPreview(context, index, preview))
      return true
    }
    context.syncing = true
    try {
      for (let index = 0; index < context.views.length; index++) {
        const view = context.views[index]
        const text = this.block.columns[index].text
        if (view.state.doc.toString() !== text)
          view.dispatch({ changes: documentChanges(view.state.doc.toString(), text) })
      }
    } finally {
      context.syncing = false
    }
    return true
  }
  destroy(root) {
    for (const view of root.columnContext?.views ?? []) view.destroy()
    for (const preview of root.columnContext?.previews ?? [])
      queueMicrotask(() => preview.unmount())
  }
  ignoreEvent() {
    return true
  }
}

function decorations(state) {
  return Decoration.set(
    columnBlocks(state.doc.toString())
      .filter((block) => {
        let hidden = false
        state.field(foldField, false)?.between(block.from, block.to, () => {
          hidden = true
        })
        return !hidden
      })
      .map((block) =>
        Decoration.replace({
          widget: new ColumnsWidget(block, state.readOnly, state.facet(taskNotes)),
          block: true,
        }).range(block.from, block.to),
      ),
    true,
  )
}

export const columnsField = StateField.define({
  create: decorations,
  update(value, transaction) {
    return transaction.docChanged ||
      transaction.startState.field(foldField, false) !==
        transaction.state.field(foldField, false) ||
      transaction.startState.readOnly !== transaction.state.readOnly ||
      transaction.startState.facet(taskNotes) !== transaction.state.facet(taskNotes)
      ? decorations(transaction.state)
      : value
  },
  provide: (field) => EditorView.decorations.from(field),
})
