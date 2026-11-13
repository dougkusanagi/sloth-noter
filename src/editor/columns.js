import { EditorState, Facet, StateField } from '@codemirror/state'
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
import { taskNotes } from './live-decorations.js'
import { openExternalLink } from '../external-links.js'
import { toast } from 'sonner'
import { searchHighlights, setSearchHighlights } from './search.js'

export const columnImageHandler = Facet.define()
export const columnReadServices = Facet.define()

let dragged = null
const searchByView = new WeakMap()

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
      context.views.push(view)
    })
    applyHighlights(context, searchByView.get(parent))
    if (!this.readOnly) {
      const controls = document.createElement('div')
      controls.className = 'cm-columns-controls'
      root.append(controls)
      const add = document.createElement('button')
      add.type = 'button'
      add.className = 'cm-add-column'
      add.setAttribute('aria-label', t('columns.add'))
      add.title = t('columns.add')
      add.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
      add.addEventListener('click', () => {
        const from = context.block.from
        const index = context.block.columns.length
        const insertAt = context.block.to - '<!-- /sloth:columns -->'.length
        parent.dispatch({
          changes: { from: insertAt, insert: '<!-- sloth:column -->\n\n\n\n' },
          userEvent: 'input',
        })
        requestAnimationFrame(() =>
          parent.dom
            .querySelector(`[data-columns-from="${from}"]`)
            ?.columnContext?.views[index]?.focus(),
        )
      })
      controls.append(add)
      const unwrap = document.createElement('button')
      unwrap.type = 'button'
      unwrap.className = 'cm-remove-columns'
      unwrap.textContent = t('columns.remove')
      unwrap.title = t('columns.removeHint')
      unwrap.addEventListener('click', () => {
        const block = context.block
        const text = block.columns.map((column) => column.text).join('\n\n')
        parent.dispatch({
          changes: { from: block.from, to: block.to, insert: text },
          selection: { anchor: block.from + text.length },
          userEvent: 'input',
        })
        parent.focus()
      })
      controls.append(unwrap)
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
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
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
