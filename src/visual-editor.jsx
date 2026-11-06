import { ShortcutButton } from './components/shortcut-button.jsx'
import { openExternalLink } from './external-links.js'
import { toast } from 'sonner'
import { Shortcut } from './components/main-menu.jsx'
import {
  EDITOR_SHORTCUTS,
  blockKeys,
  blockShortcut,
  formatShortcut,
  shortcutEdit,
} from './editor-shortcuts.js'
import { transactionHistory } from './editor/history-log.js'
import { searchHighlights } from './editor/search.js'
import { clipboardImageFiles } from './clipboard.js'
import { ImageInsert } from './components/image-insert.jsx'
import { ensureTitle, mandatoryTitle, navigateTitle } from './title.js'
import { inlineSyntax } from './live-markdown.js'
import { emptyBodyLine, liveMarkdown, taskNotes } from './editor/live-decorations.js'
import { foldField } from './editor/folding.js'
import { accordionField } from './editor/accordion.js'
import {
  columnDrag,
  columnImageHandler,
  columnReadServices,
  columnsField,
} from './editor/columns.js'
import { railsLayer } from './editor/rails.js'
import {
  codeCopyHandler,
  codeFold,
  codeWrap,
  setCodeWrapping,
  stickyCodeCopy,
} from './editor/code-copy.js'
import {
  insertTableColumnAt,
  insertTableRowAt,
  moveTable,
  removeTableColumnAt,
  removeTableRowAt,
  tableAt,
} from './editor/table.js'
import {
  continueList,
  indentList,
  moveList,
  navigateToFence,
  wrapSelectedText,
} from './editor/keys.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from './i18n.js'
import { flushSync } from 'react-dom'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, redo } from '@codemirror/commands'
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { activeFormats, formatSelection } from './format-selection.js'
import { blockEdit } from './insert-block.js'
import { fencedPasteInEmptyBlock } from './fenced-paste.js'
import { markdownTree, walk } from './markdown-model.js'
import {
  ArrowDownToLine,
  ArrowRightToLine,
  CodeXml,
  ImagePlus,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Link,
  Quote,
  Table as TableIcon,
  Trash2,
  ChevronRight,
  Columns2,
} from 'lucide-react'

/* eslint-disable react/jsx-key -- static tuples, rendered with explicit keys below */

const formatButtons = [
  ['bold', 'format.bold', <strong>B</strong>],
  ['italic', 'format.italic', <em>I</em>],
  ['code', 'format.code', <span className="format-code">&lt;/&gt;</span>],
  ['link', 'format.link', <Link size={16} aria-hidden="true" />],
  ['heading', 'format.heading', <span>H₂</span>],
  ['quote', 'format.quote', <span>❝</span>],
  ['list', 'format.list', <span>☷</span>],
]
/* eslint-enable react/jsx-key */
const keysForLabel = (label) =>
  label === 'format.heading'
    ? blockKeys('h2')
    : EDITOR_SHORTCUTS.find(([, key]) => key === label)?.[0]

const blockButtons = [
  ['h2', 'block.h2'],
  ['h3', 'block.h3'],
  ['h4', 'block.h4'],
  ['quote', 'block.quote'],
  ['list', 'block.list'],
  ['numbered', 'block.numbered'],
  ['table', 'block.table'],
  ['code', 'block.code'],
  ['accordion', 'block.accordion'],
  ['columns', 'block.columns'],
  ['image', 'block.image'],
  ['link', 'format.link'],
]

function TableMenuIcon({ kind }) {
  const props = { size: 16, 'aria-hidden': true }
  if (kind === 'row') return <ArrowDownToLine {...props} />
  if (kind === 'column') return <ArrowRightToLine {...props} />
  return <Trash2 {...props} />
}

const blockIcons = {
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  quote: Quote,
  list: List,
  numbered: ListOrdered,
  table: TableIcon,
  code: CodeXml,
  accordion: ChevronRight,
  columns: Columns2,
  image: ImagePlus,
  link: Link,
}

function BlockIcon({ action }) {
  const Icon = blockIcons[action]
  if (!Icon) return null
  return <Icon className="block-icon" aria-hidden="true" />
}

function insideCodeBlock(state, line) {
  let inside = false
  walk(markdownTree(state.doc.toString()), (node) => {
    if (
      node.type === 'code' &&
      node.position.start.line <= line.number &&
      node.position.end.line >= line.number
    )
      inside = true
  })
  return inside
}

export function VisualEditor({
  noteId,
  notes = [],
  body,
  onChange,
  onReady,
  onSelectionChange,
  onStatisticsSelection,
  onOpenWiki,
  onImageFiles,
  onImageUrl,
  onCopy,
  imageBusy,
  readOnly = false,
  wrapLines = true,
  wrapPage = wrapLines,
}) {
  const notesCompartment = useRef(new Compartment())
  const wrappingCompartment = useRef(new Compartment())
  const readOnlyCompartment = useRef(new Compartment())
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  const host = useRef(null),
    viewRef = useRef(null),
    syncing = useRef(false)
  const [toolbar, setToolbar] = useState(null)
  const [insertAt, setInsertAt] = useState(null)
  const [blockMenu, setBlockMenu] = useState(false)
  const [blockQuery, setBlockQuery] = useState('')
  const blockSearch = useRef(null)
  const [tableMenu, setTableMenu] = useState(null)
  const [imagePanel, setImagePanel] = useState(null)
  const blockMenuRef = useRef(false)
  blockMenuRef.current = blockMenu || Boolean(imagePanel)
  const [linkEditing, setLinkEditing] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const linkInput = useRef(null)
  const callbacks = useRef({
    onChange,
    onReady,
    onSelectionChange,
    onStatisticsSelection,
    onOpenWiki,
    onImageFiles,
    onImageUrl,
    imageBusy,
    onCopy,
  })
  callbacks.current = {
    onChange,
    onReady,
    onSelectionChange,
    onStatisticsSelection,
    onOpenWiki,
    onImageFiles,
    onImageUrl,
    imageBusy,
    onCopy,
  }

  function positionToolbar(view) {
    const selection = view.state.selection.main
    if (selection.empty || !view.hasFocus || view.state.readOnly) {
      setToolbar(null)
      return
    }
    const start = view.coordsAtPos(selection.from),
      end = view.coordsAtPos(selection.to)
    if (!start || !end) {
      setToolbar(null)
      return
    }
    if (start.top < 46 || start.top > window.innerHeight) {
      setToolbar(null)
      return
    }
    const margin = Math.min(124, window.innerWidth / 2)
    const x = Math.max(margin, Math.min(window.innerWidth - margin, (start.left + end.right) / 2))
    const y = start.top > 55 ? start.top - 8 : end.bottom + 8
    setToolbar({
      x,
      y,
      below: start.top <= 55,
      active: activeFormats(view.state.doc.toString(), selection.from, selection.to),
    })
  }

  function positionInsert(view) {
    if (blockMenuRef.current) return
    view.requestMeasure({
      key: 'insert-trigger',
      read: () => {
        if (!view.hasFocus || view.state.readOnly || !view.state.selection.main.empty) return null
        const line = view.state.doc.lineAt(view.state.selection.main.head)
        if (line.text.trim()) return null
        if (insideCodeBlock(view.state, line)) return null
        if (line.number === emptyBodyLine(view.state)) return null
        const coords = view.coordsAtPos(line.from)
        if (!coords || coords.top < 46 || coords.top > window.innerHeight) return null
        return { from: line.from, x: coords.left + 4, y: coords.top }
      },
      write: (position) => {
        if (blockMenuRef.current) return
        setInsertAt(position)
      },
    })
  }

  function blockMenuLeft() {
    const width = Math.min(290, window.innerWidth - 16)
    return Math.max(8, Math.min(insertAt.x, window.innerWidth - width - 8))
  }

  function insertBlock(action) {
    const view = viewRef.current
    if (!view) return
    if (action === 'link') {
      setBlockMenu(false)
      const selection = view.state.selection.main
      if (selection.empty) {
        view.dispatch({
          changes: { from: selection.from, insert: '[](https://)' },
          selection: EditorSelection.single(selection.from + 1),
          userEvent: 'formatacao',
        })
        view.focus()
        return
      }
      const result = formatSelection(
        view.state.doc.toString(),
        selection.from,
        selection.to,
        'link',
        'https://',
      )
      if (result) {
        view.dispatch({
          changes: { from: result.from, to: result.to, insert: result.insert },
          selection: EditorSelection.single(result.selectionFrom, result.selectionTo),
          userEvent: 'formatacao',
        })
        view.focus()
      }
      return
    }
    const selection = view.state.selection.main
    if (action === 'image') {
      const coords = view.coordsAtPos(selection.head)
      if (coords)
        setInsertAt({ from: selection.from, x: Math.max(8, coords.left - 34), y: coords.top })
      setImagePanel({ from: selection.from, to: selection.to })
      setBlockMenu(false)
      setToolbar(null)
      return
    }
    const edit = blockEdit(view.state.doc.toString(), selection.from, selection.to, action)
    if (!edit) return
    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: EditorSelection.single(edit.selectionFrom, edit.selectionTo),
      userEvent: 'bloco',
      scrollIntoView: true,
    })
    setBlockMenu(false)
    setInsertAt(null)
    view.focus()
    if (action === 'columns') {
      const from = edit.from + edit.insert.indexOf('<!-- sloth:columns -->')
      requestAnimationFrame(() =>
        view.dom
          .querySelector(`[data-columns-from="${from}"] .cm-column-editor .cm-content`)
          ?.focus(),
      )
    }
  }

  function applyFormat(action, url = '') {
    const view = viewRef.current
    if (!view) return
    const selection = view.state.selection.main
    const result = formatSelection(
      view.state.doc.toString(),
      selection.from,
      selection.to,
      action,
      url,
    )
    if (!result) return
    view.dispatch({
      changes: { from: result.from, to: result.to, insert: result.insert },
      selection: EditorSelection.single(result.selectionFrom, result.selectionTo),
      userEvent: 'formatacao',
    })
    view.focus()
    setLinkEditing(false)
    setLinkUrl('')
    positionToolbar(view)
  }

  function runTableMenu(action) {
    const menu = tableMenu,
      view = viewRef.current
    if (!menu || !view) return
    setTableMenu(null)
    if (action === 'add-row') insertTableRowAt(view, menu.tableFirst, menu.row, menu.column)
    if (action === 'add-column') insertTableColumnAt(view, menu.tableFirst, menu.row, menu.column)
    if (action === 'remove-row') removeTableRowAt(view, menu.tableFirst, menu.row)
    if (action === 'remove-column') removeTableColumnAt(view, menu.tableFirst, menu.column)
  }

  useEffect(() => {
    if (linkEditing) linkInput.current?.focus()
  }, [linkEditing])
  useEffect(() => {
    if (blockMenu) {
      setBlockQuery('')
      requestAnimationFrame(() => blockSearch.current?.focus())
    }
  }, [blockMenu])
  useEffect(() => {
    if (!blockMenu) return
    function closeOnOutsideClick(event) {
      if (event.target.closest?.('.insert-trigger, .block-menu')) return
      flushSync(() => {
        setBlockMenu(false)
        setInsertAt(null)
      })
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
    const frame = requestAnimationFrame(() =>
      host.current?.querySelector('.table-context-menu button:not(:disabled)')?.focus(),
    )
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOnOutsideClick, true)
      document.removeEventListener('click', closeOnOutsideClick, true)
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [tableMenu])

  useLayoutEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: ensureTitle(body),
        selection: { anchor: 2 },
        extensions: [
          // Starts editable; the effect below switches to read-only after the first measure.
          readOnlyCompartment.current.of(EditorState.readOnly.of(false)),
          // Preview keeps the same view; drop every edit except task toggles and outside sync.
          EditorState.transactionFilter.of((transaction) =>
            transaction.docChanged &&
            transaction.startState.readOnly &&
            !syncing.current &&
            !transaction.isUserEvent('tarefa')
              ? []
              : transaction,
          ),
          mandatoryTitle,
          history(),
          drawSelection(),
          codeWrap,
          codeFold,
          EditorState.allowMultipleSelections.of(true),
          keymap.of([
            {
              key: 'Shift-Home',
              run: (view) => {
                const range = view.state.selection.main
                if (
                  view.state.selection.ranges.length !== 1 ||
                  range.head !== view.state.doc.length
                )
                  return false
                view.dispatch({
                  selection: EditorSelection.single(
                    range.anchor,
                    view.state.doc.lineAt(range.head).from,
                  ),
                  scrollIntoView: true,
                })
                return true
              },
            },
            {
              key: 'Mod-d',
              run: (view) => {
                const selection = view.state.selection
                const main = selection.main
                if (main.empty) {
                  const word = view.state.wordAt(main.head)
                  if (!word) return false
                  view.dispatch({ selection: EditorSelection.single(word.from, word.to) })
                  return true
                }
                const text = view.state.sliceDoc(main.from, main.to)
                const doc = view.state.doc.toString()
                const occupied = selection.ranges
                let from = main.to
                for (let i = 0; i < doc.length; i++) {
                  let found = doc.indexOf(text, from)
                  if (found < 0) found = doc.indexOf(text)
                  if (found < 0) break
                  if (
                    !occupied.some((range) => found < range.to && found + text.length > range.from)
                  ) {
                    view.dispatch({
                      selection: EditorSelection.create(
                        [...occupied, EditorSelection.range(found, found + text.length)],
                        occupied.length,
                      ),
                    })
                    return true
                  }
                  from = found + 1
                  if (from >= doc.length) from = 0
                }
                return true
              },
            },
            { key: 'Ctrl-Shift-ArrowUp', run: (view) => moveList(view, -1) },
            { key: 'Ctrl-Shift-ArrowDown', run: (view) => moveList(view, 1) },
            { key: 'Enter', run: (view) => moveTable(view, 'enter') },
            { key: 'Shift-Enter', run: (view) => moveTable(view, 'shift-enter') },
            { key: 'Tab', run: (view) => indentList(view) },
            { key: 'Shift-Tab', run: (view) => indentList(view, true) },
            { key: 'Tab', run: (view) => navigateTitle(view) },
            { key: 'Shift-Tab', run: (view) => navigateTitle(view, true) },
            { key: 'Tab', run: (view) => moveTable(view, 'tab') },
            { key: 'Shift-Tab', run: (view) => moveTable(view, 'shift-tab') },
            { key: 'ArrowUp', run: (view) => moveTable(view, 'up') },
            { key: 'ArrowDown', run: (view) => moveTable(view, 'down') },
            { key: 'ArrowLeft', run: (view) => moveTable(view, 'left') },
            { key: 'ArrowRight', run: (view) => moveTable(view, 'right') },
            { key: 'Home', run: (view) => moveTable(view, 'home') },
            { key: 'End', run: (view) => moveTable(view, 'end') },
            { key: 'Backspace', run: (view) => moveTable(view, 'backspace') },
            { key: 'Delete', run: (view) => moveTable(view, 'delete') },
            { key: 'Enter', run: continueList },
            { key: 'ArrowDown', run: (view) => navigateToFence(view, 1) },
            { key: 'ArrowUp', run: (view) => navigateToFence(view, -1) },
            // Ctrl+I is italic here, not "select parent syntax".
            ...defaultKeymap.filter((binding) => binding.key !== 'Mod-i'),
            ...historyKeymap,
            // CodeMirror binds Ctrl+Shift+Z only on Linux.
            { key: 'Mod-Shift-z', run: redo, preventDefault: true },
          ]),
          wrappingCompartment.current.of(wrapPage ? EditorView.lineWrapping : []),
          EditorView.contentAttributes.of({
            'aria-label': t('editor.visual'),
            spellcheck: 'false',
          }),
          EditorView.domEventHandlers({
            keydown: (event, view) => {
              if (
                view.state.readOnly &&
                !((event.ctrlKey || event.metaKey) && event.key === 'Enter')
              )
                return false
              if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                const selection = view.state.selection.main
                const line = view.state.doc.lineAt(selection.head)
                if (selection.empty && !line.text.trim() && !insideCodeBlock(view.state, line)) {
                  const coords = view.coordsAtPos(selection.head)
                  if (coords) {
                    event.preventDefault()
                    setInsertAt({
                      from: line.from,
                      x: coords.left + 4,
                      y: coords.top,
                      hasBodyPlaceholder: line.number === emptyBodyLine(view.state),
                    })
                    setBlockMenu(true)
                    return true
                  }
                }
              }
              const block = blockShortcut(event)
              if (block) {
                event.preventDefault()
                event.stopPropagation()
                insertBlock(block)
                return true
              }
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                const line = view.state.doc.lineAt(view.state.selection.main.head)
                const token = inlineSyntax(line.text).find(
                  (token) =>
                    token.kind === 'wiki' &&
                    line.from + token.start <= view.state.selection.main.head &&
                    line.from + token.end >= view.state.selection.main.head,
                )
                if (token) {
                  event.preventDefault()
                  callbacks.current.onOpenWiki?.(token.target)
                  return true
                }
              }
              const shortcut = formatShortcut(event)
              if (shortcut) {
                const { from, to } = view.state.selection.main
                const edit = shortcutEdit(view.state.doc.toString(), from, to, shortcut)
                if (!edit) return false
                event.preventDefault()
                event.stopPropagation()
                view.dispatch({
                  changes: { from: edit.from, to: edit.to, insert: edit.insert },
                  selection: EditorSelection.single(edit.selectionFrom, edit.selectionTo),
                  userEvent: 'formatacao',
                })
                return true
              }
              return wrapSelectedText(event, view)
            },
            paste: (event, view) => {
              if (view.state.readOnly) {
                event.preventDefault()
                return true
              }
              const selection = view.state.selection.main
              const files = clipboardImageFiles(event.clipboardData)
              if (files.length) {
                event.preventDefault()
                event.stopPropagation()
                callbacks.current.onImageFiles?.(files, { from: selection.from, to: selection.to })
                return true
              }
              const pasted = event.clipboardData?.getData('text/plain')
              const replacement =
                pasted &&
                fencedPasteInEmptyBlock(view.state.doc, selection.from, selection.to, pasted)
              if (!replacement) return false
              event.preventDefault()
              view.dispatch({
                changes: { from: replacement.from, to: replacement.to, insert: replacement.insert },
                selection: EditorSelection.single(replacement.selection),
                userEvent: 'input.paste',
              })
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
              if (
                cell &&
                event.target.closest?.('.cm-md-inline-link') &&
                !view.state.readOnly &&
                !event.ctrlKey &&
                !event.metaKey
              ) {
                const from = Number(cell.dataset.cellFrom)
                const to = Number(cell.dataset.cellTo)
                if (Number.isSafeInteger(from) && Number.isSafeInteger(to)) {
                  event.preventDefault()
                  view.focus()
                  view.dispatch({ selection: EditorSelection.single(to) })
                  return true
                }
              }
              const wiki = event.target.closest?.('[data-wiki]')
              if (wiki) {
                event.preventDefault()
                event.stopPropagation()
                callbacks.current.onOpenWiki?.(wiki.dataset.wiki)
                return true
              }
              const link = event.target.closest?.('.cm-md-inline-link')
              if (
                link &&
                (view.state.readOnly || event.ctrlKey || event.metaKey) &&
                link.dataset.href
              ) {
                event.preventDefault()
                event.stopPropagation()
                openExternalLink(link.dataset.href).catch((error) => toast.error(String(error)))
                return true
              }
              if (link && !view.state.readOnly && !event.ctrlKey && !event.metaKey) {
                const position = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
                if (position != null) {
                  const from = view.posAtDOM(link, 0)
                  const to = from + link.textContent.length
                  event.preventDefault()
                  view.focus()
                  view.dispatch({
                    selection: EditorSelection.single(Math.max(from, Math.min(to, position))),
                  })
                  return true
                }
              }
              if (cell || event.target.closest?.('button')) return false
              const line = event.target.closest?.('.cm-line')
              if (
                line === event.target &&
                line.querySelector('[data-wiki]') &&
                !view.state.readOnly
              ) {
                const position = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
                if (position != null) {
                  const bounds = view.state.doc.lineAt(view.posAtDOM(line, 0))
                  event.preventDefault()
                  view.focus()
                  view.dispatch({
                    selection: EditorSelection.single(
                      Math.max(bounds.from, Math.min(bounds.to, position)),
                    ),
                  })
                  return true
                }
              }
              if (line && !line.classList.contains('cm-md-table-row')) return false
              const position =
                view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
                (event.target.closest?.('.cm-content, .cm-scroller') ? view.state.doc.length : null)
              if (position === null) return false
              event.preventDefault()
              view.focus()
              view.dispatch({ selection: EditorSelection.single(position) })
              return true
            },
            contextmenu: (event, view) => {
              if (view.state.readOnly) return false
              const cell = event.target.closest?.('.cm-md-table-cell')
              if (!cell) return false
              const from = Number(cell.dataset.cellFrom)
              if (!Number.isSafeInteger(from)) return false
              const line = view.state.doc.lineAt(from)
              const table = tableAt(view.state.doc, line.number)
              if (!table || line.number === table.first + 1) return false
              const column = Number(cell.dataset.column)
              const row = line.number === table.first ? 0 : line.number - table.first - 1
              const x = Math.max(
                8,
                Math.min(
                  event.clientX || cell.getBoundingClientRect().left,
                  window.innerWidth - 270,
                ),
              )
              const y = Math.max(
                8,
                Math.min(
                  event.clientY || cell.getBoundingClientRect().top,
                  window.innerHeight - 250,
                ),
              )
              event.preventDefault()
              event.stopPropagation()
              setTableMenu({
                x,
                y,
                row,
                column,
                tableFirst: table.first,
                columnCount: table.columnCount,
                hasBody: table.last > table.first + 1,
              })
              return true
            },
            focus: (_event, view) => {
              positionToolbar(view)
              positionInsert(view)
              return false
            },
            blur: (event) => {
              if (!event.relatedTarget?.closest?.('.format-toolbar')) setToolbar(null)
              if (!event.relatedTarget?.closest?.('.insert-trigger, .block-menu, .image-insert')) {
                setInsertAt(null)
                setBlockMenu(false)
              }
              return false
            },
          }),
          foldField,
          accordionField,
          columnsField,
          columnDrag,
          columnImageHandler.of((files, point) => callbacks.current.onImageFiles?.(files, point)),
          columnReadServices.of({
            onCopy: (text) => callbacks.current.onCopy?.(text),
            onOpenWiki: (target) => callbacks.current.onOpenWiki?.(target),
          }),
          railsLayer,
          notesCompartment.current.of(taskNotes.of(notes)),
          liveMarkdown,
          searchHighlights,
          stickyCodeCopy,
          codeCopyHandler.of((source) => callbacks.current.onCopy?.(source)),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) {
              callbacks.current.onStatisticsSelection?.(
                update.state.selection.ranges
                  .filter((range) => !range.empty)
                  .map((range) => update.state.doc.sliceString(range.from, range.to))
                  .join('\n'),
              )
            }
            if (update.docChanged && !syncing.current)
              callbacks.current.onChange(
                update.state.doc.toString(),
                update.changes,
                (before, after) => transactionHistory(update.transactions, before, after),
              )
            if (
              update.selectionSet &&
              update.view.hasFocus &&
              update.transactions.some(
                (transaction) =>
                  transaction.isUserEvent('select') && !transaction.isUserEvent('select.pointer'),
              )
            )
              callbacks.current.onSelectionChange?.(update.state.selection.main)
            if (
              update.selectionSet ||
              update.docChanged ||
              update.viewportChanged ||
              update.geometryChanged
            ) {
              positionToolbar(update.view)
              positionInsert(update.view)
            }
          }),
        ],
      }),
      parent: host.current,
    })
    viewRef.current = view
    const capturePointerSelection = (event) => {
      if (event.target.closest?.('button, input, select, textarea')) return
      const line = event.target.closest?.('.cm-line')
      const insideColumn = event.target.closest?.('.cm-column-editor')
      const point = { x: event.clientX, y: event.clientY }
      const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
      queueMicrotask(() => {
        if (!view.dom.isConnected) return
        const selection = view.state.selection.main
        if (
          line?.isConnected &&
          !insideColumn &&
          !modified &&
          !view.state.readOnly &&
          !line.classList.contains('cm-md-table-row') &&
          selection.empty
        ) {
          const bounds = view.state.doc.lineAt(view.posAtDOM(line, 0))
          if (selection.head < bounds.from || selection.head > bounds.to) {
            const position = view.posAtCoords(point, false)
            if (position != null)
              view.dispatch({
                selection: EditorSelection.single(
                  Math.max(bounds.from, Math.min(bounds.to, position)),
                ),
              })
          }
        }
        callbacks.current.onSelectionChange?.(view.state.selection.main)
      })
    }
    view.dom.addEventListener('pointerup', capturePointerSelection)
    const focusBlankArea = (event) => {
      if (event.target.closest?.('.cm-editor') !== view.dom) return
      if (
        event.target.closest?.(
          '.cm-line, .cm-md-table-cell, button, .format-toolbar, .insert-trigger, .block-menu',
        )
      )
        return
      const position =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.doc.length
      event.preventDefault()
      view.focus()
      view.dispatch({ selection: EditorSelection.single(position) })
    }
    const reposition = () => {
      positionToolbar(view)
      positionInsert(view)
    }
    // Both the document and editor can scroll; the trigger uses viewport coordinates.
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    const layoutObserver = new ResizeObserver(() => {
      view.dispatch({})
      view.requestMeasure()
      reposition()
    })
    layoutObserver.observe(view.dom)
    layoutObserver.observe(view.contentDOM)
    view.scrollDOM.addEventListener('mousedown', focusBlankArea)
    callbacks.current.onReady(view)
    return () => {
      view.dom.removeEventListener('pointerup', capturePointerSelection)
      callbacks.current.onReady(null)
      viewRef.current = null
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      layoutObserver.disconnect()
      view.scrollDOM.removeEventListener('mousedown', focusBlankArea)
      view.destroy()
    }
    // The view is recreated per note; later body changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // Synchronize controlled text before the next browser input; a passive effect can
  // replay an older body over rapid EditContext updates on Android.
  useLayoutEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === body) return
    syncing.current = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: body } })
    syncing.current = false
  }, [body])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrappingCompartment.current.reconfigure(wrapPage ? EditorView.lineWrapping : []),
    })
  }, [wrapPage, noteId])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setCodeWrapping.of(wrapLines) })
  }, [wrapLines, noteId])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // A view created read-only keeps stale line heights for unrevealed lines, which
    // misplaces rails and line-boundary moves; switch once the editable layout is measured.
    view.requestMeasure({
      key: 'read-only',
      read: () => null,
      // Dispatching inside the measure cycle is not allowed.
      write: () =>
        queueMicrotask(() => {
          const next = readOnlyRef.current
          if (viewRef.current === view && view.state.readOnly !== next) {
            view.dispatch({
              effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(next)),
            })
            requestAnimationFrame(() => {
              if (viewRef.current === view) view.dispatch({})
            })
          }
        }),
    })
    if (readOnly) {
      setToolbar(null)
      setInsertAt(null)
      setBlockMenu(false)
      setTableMenu(null)
      setImagePanel(null)
    }
  }, [readOnly])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: notesCompartment.current.reconfigure(taskNotes.of(notes)),
    })
  }, [notes])

  const normalizedQuery = blockQuery
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const filteredBlocks = blockButtons.filter(([action, label]) =>
    `${action} ${t(label)}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(normalizedQuery),
  )
  return (
    <div
      className={`visual-editor${readOnly ? ' read-only' : ''}${blockMenu ? ' block-menu-open' : ''}`}
      data-wrap-page={wrapPage}
      ref={host}
    >
      {toolbar && (
        <div
          className={`format-toolbar${toolbar.below ? ' below' : ''}`}
          role="toolbar"
          aria-label={t('editor.formatBar')}
          style={{ left: toolbar.x, top: toolbar.y }}
          onMouseDown={(event) => {
            if (!event.target.closest('input')) event.preventDefault()
          }}
        >
          {linkEditing ? (
            <form
              className="format-link"
              onSubmit={(event) => {
                event.preventDefault()
                applyFormat('link', linkUrl)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setLinkEditing(false)
                  viewRef.current?.focus()
                }
              }}
            >
              <input
                ref={linkInput}
                aria-label={t('editor.linkUrl')}
                type="text"
                inputMode="url"
                placeholder="https://..."
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                required
              />
              <ShortcutButton type="submit" label={t('editor.linkApply')} keys="Enter">
                ↗
              </ShortcutButton>
            </form>
          ) : (
            formatButtons.map(([action, label, icon]) => (
              <ShortcutButton
                key={action}
                type="button"
                label={t(label)}
                keys={keysForLabel(label)}
                aria-pressed={toolbar.active.includes(action)}
                className={toolbar.active.includes(action) ? 'active' : undefined}
                onClick={() =>
                  action === 'link' && !toolbar.active.includes('link')
                    ? setLinkEditing(true)
                    : applyFormat(action)
                }
              >
                {icon}
              </ShortcutButton>
            ))
          )}
        </div>
      )}
      {insertAt && (
        <>
          <span
            hidden={insertAt.hasBodyPlaceholder}
            className="insert-trigger"
            aria-hidden="true"
            style={{ left: insertAt.x, top: insertAt.y }}
          >
            {t('editor.slashHint')}
          </span>
          {blockMenu && (
            <div
              className="block-menu"
              role="group"
              aria-label={t('editor.insertBlock')}
              style={{
                left: blockMenuLeft(),
                top: Math.max(
                  52,
                  Math.min(
                    insertAt.y + 30,
                    window.innerHeight - Math.min(350, window.innerHeight * 0.6) - 8,
                  ),
                ),
              }}
              onMouseDown={(event) => {
                if (event.target !== blockSearch.current) event.preventDefault()
              }}
              onKeyDown={(event) => {
                const block = blockShortcut(event)
                if (block) {
                  event.preventDefault()
                  event.stopPropagation()
                  insertBlock(block)
                  return
                }
                const buttons = [...event.currentTarget.querySelectorAll('button')]
                const index = buttons.indexOf(document.activeElement)
                if (
                  event.target !== blockSearch.current &&
                  event.key.length === 1 &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.altKey
                ) {
                  event.preventDefault()
                  setBlockQuery((query) => query + event.key)
                  blockSearch.current?.focus()
                }
                if (event.key === 'Enter' && event.target === blockSearch.current) {
                  event.preventDefault()
                  buttons[0]?.click()
                }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  buttons[
                    (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
                  ]?.focus()
                }
                if (event.key === 'Home' && event.target !== blockSearch.current) {
                  event.preventDefault()
                  buttons[0]?.focus()
                }
                if (event.key === 'End' && event.target !== blockSearch.current) {
                  event.preventDefault()
                  buttons.at(-1)?.focus()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setBlockMenu(false)
                  viewRef.current?.focus()
                }
                if (event.key === 'Tab') setBlockMenu(false)
              }}
            >
              <input
                ref={blockSearch}
                className="block-search"
                value={blockQuery}
                onChange={(event) => setBlockQuery(event.target.value)}
                placeholder={t('editor.blockSearch')}
                aria-label={t('editor.blockSearch')}
              />
              {filteredBlocks.map(([action, label]) => (
                <ShortcutButton
                  key={action}
                  label={t(label)}
                  keys={blockKeys(action)}
                  type="button"
                  onClick={() => insertBlock(action)}
                >
                  <BlockIcon action={action} />
                  <span className="menu-item-label">{t(label)}</span>
                  {blockKeys(action) && <Shortcut keys={blockKeys(action)} />}
                </ShortcutButton>
              ))}
              {!filteredBlocks.length && (
                <p className="block-no-results" role="status">
                  {t('editor.noBlocks')}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {imagePanel && (
        <ImageInsert
          position={{
            left: Math.min(
              insertAt?.x ?? 20,
              window.innerWidth - Math.min(320, window.innerWidth - 24) - 12,
            ),
            top: Math.max(52, Math.min((insertAt?.y ?? 80) + 30, window.innerHeight - 320)),
          }}
          busy={imageBusy}
          onFiles={(files) => onImageFiles(files, imagePanel)}
          onUrl={(url) => onImageUrl(url, imagePanel)}
          onClose={() => {
            setImagePanel(null)
            setInsertAt(null)
            viewRef.current?.focus()
            requestAnimationFrame(() => {
              if (viewRef.current) positionInsert(viewRef.current)
            })
          }}
        />
      )}
      {tableMenu && (
        <div
          className="table-context-menu"
          role="menu"
          aria-label={t('table.actions')}
          style={{ left: tableMenu.x, top: tableMenu.y }}
          onMouseDown={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
            const index = buttons.indexOf(document.activeElement)
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              buttons[
                (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
              ]?.focus()
            }
            if (event.key === 'Home') {
              event.preventDefault()
              buttons[0]?.focus()
            }
            if (event.key === 'End') {
              event.preventDefault()
              buttons.at(-1)?.focus()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setTableMenu(null)
              viewRef.current?.focus()
            }
          }}
        >
          <div className="table-context-menu-heading">Tabela</div>
          <button type="button" role="menuitem" onClick={() => runTableMenu('add-row')}>
            <span className="table-context-menu-icon">
              <TableMenuIcon kind="row" />
            </span>
            <span>{t('table.addRow')}</span>
            <span className="menu-shortcut">
              <kbd>Enter</kbd>
            </span>
          </button>
          <button type="button" role="menuitem" onClick={() => runTableMenu('add-column')}>
            <span className="table-context-menu-icon">
              <TableMenuIcon kind="column" />
            </span>
            <span>{t('table.addColumn')}</span>
            <span className="menu-shortcut">
              <kbd>Tab</kbd>
            </span>
          </button>
          <div className="table-context-menu-separator" />
          <button
            type="button"
            role="menuitem"
            disabled={tableMenu.row === 0 && !tableMenu.hasBody}
            onClick={() => runTableMenu('remove-row')}
          >
            <span className="table-context-menu-icon">
              <TableMenuIcon kind="trash" />
            </span>
            <span>{t('table.removeRow')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={tableMenu.columnCount <= 1}
            onClick={() => runTableMenu('remove-column')}
          >
            <span className="table-context-menu-icon">
              <TableMenuIcon kind="trash" />
            </span>
            <span>{t('table.removeColumn')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
