import { selectedColors, blockColorMetadata } from './document-colors.js'
import { ColorPalette } from './components/color-palette.jsx'
import { documentColors, colorDocument, colorBlock } from './editor/document-colors.js'
import { DocumentOutline } from './components/document-outline.jsx'
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
import { clipboardAction } from './clipboard-actions.js'
import { ImageInsert } from './components/image-insert.jsx'
import { ensureTitle, mandatoryTitle, navigateTitle } from './title.js'
import { inlineSyntax } from './live-markdown.js'
import { emptyBodyLine, liveMarkdown, taskNotes } from './editor/live-decorations.js'
import { foldField } from './editor/folding.js'
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
import { moveTable, tableAt, openTableMenu, tableUi } from './editor/table.js'
import { sheet } from './editor/sheet.js'
import { blockHandle } from './editor/block-handle.js'
import { OPEN_INSERT_EVENT } from './editor/block-actions.js'
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
import { activeFormats, formatSelection, selectionInCode } from './format-selection.js'
import { blockEdit } from './insert-block.js'
import { fencedPasteInEmptyBlock } from './fenced-paste.js'
import { markdownTree, walk } from './markdown-model.js'
import {
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
  Columns2,
  Copy,
  ClipboardPaste,
  Scissors,
  Bold,
  Italic,
  Strikethrough,
  ChevronDown,
  Ellipsis,
  Check,
} from 'lucide-react'
import { documentBlocks } from './block-move.js'
import { blockIconMarkup } from './editor/block-icons.js'
import { TURN_INTO, turnBlocksInto } from './editor/block-actions.js'

/* eslint-disable react/jsx-key -- static tuples, rendered with explicit keys below */

const formatButtons = [
  ['bold', 'format.bold', <Bold size={16} aria-hidden="true" />],
  ['strike', 'format.strike', <Strikethrough size={16} aria-hidden="true" />],
  ['italic', 'format.italic', <Italic size={16} aria-hidden="true" />],
  ['link', 'format.link', <Link size={16} aria-hidden="true" />],
  ['code', 'format.code', <CodeXml size={16} aria-hidden="true" />],
]
const clipboardButtons = [
  ['copy', 'editor.copy', <Copy size={16} aria-hidden="true" />, 'C'],
  ['cut', 'editor.cut', <Scissors size={16} aria-hidden="true" />, 'X'],
  ['paste', 'editor.paste', <ClipboardPaste size={16} aria-hidden="true" />, 'V'],
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
  ['columns', 'block.columns'],
  ['image', 'block.image'],
  ['link', 'format.link'],
]

const blockIcons = {
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  quote: Quote,
  list: List,
  numbered: ListOrdered,
  table: TableIcon,
  code: CodeXml,
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
  scrollSnapshot,
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
  onPaste,
  imageBusy,
  readOnly = false,
  wrapLines = true,
  wrapPage = wrapLines,
  sourceMode = false,
  outline = true,
}) {
  const modeCompartment = useRef(new Compartment())
  const visualExtensionsRef = useRef(null)
  const appliedSourceMode = useRef(sourceMode)
  const sourceModeRef = useRef(sourceMode)
  sourceModeRef.current = sourceMode
  const notesCompartment = useRef(new Compartment())
  const wrappingCompartment = useRef(new Compartment())
  const readOnlyCompartment = useRef(new Compartment())
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  const host = useRef(null),
    viewRef = useRef(null),
    syncing = useRef(false)
  const [toolbar, setToolbar] = useState(null)
  const [toolbarMenu, setToolbarMenu] = useState(null)
  const [colorScope, setColorScope] = useState('text')
  const toolbarKey = useRef('')
  const [insertAt, setInsertAt] = useState(null)
  const [blockMenu, setBlockMenu] = useState(false)
  const [blockQuery, setBlockQuery] = useState('')
  const blockSearch = useRef(null)
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
    onPaste,
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
    onPaste,
  }

  function positionToolbar(view) {
    const selection = view.state.selection.main
    if (sourceModeRef.current || selection.empty || !view.hasFocus || view.state.readOnly) {
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
    const text = view.state.doc.toString()
    const inCode = selectionInCode(markdownTree(text), selection.from, selection.to)
    const blocks = selectedBlocks(view)
    const kind =
      blocks.length &&
      blocks.every((block) => TURN_INTO.includes(block.kind) || block.kind === 'h6')
        ? blocks[0].kind
        : null
    const margin = Math.min(inCode ? 60 : 150, window.innerWidth / 2)
    const x = Math.max(margin, Math.min(window.innerWidth - margin, (start.left + end.right) / 2))
    const y = start.top > 55 ? start.top - 8 : end.bottom + 8
    setToolbar({
      x,
      y,
      below: start.top <= 55,
      inCode,
      kind,
      colors: selectedColors(text, selection.from, selection.to),
      blockColors: blocks.length
        ? blockColorMetadata(view.state.doc.line(blocks[0].first).text) || {}
        : {},
      active: inCode ? [] : activeFormats(text, selection.from, selection.to),
    })
    // A dropdown stays open while the toolbar only moves; another selection closes it.
    const key = `${selection.from}:${selection.to}`
    if (toolbarKey.current !== key) setToolbarMenu(null)
    toolbarKey.current = key
  }

  // The blocks the selection touches, for "Turn into".
  function selectedBlocks(view) {
    const { from, to } = view.state.selection.main
    const doc = view.state.doc
    const first = doc.lineAt(from).number,
      last = doc.lineAt(to).number
    return documentBlocks(doc.toString()).filter(
      (block) => block.last >= first && block.first <= last,
    )
  }

  function turnSelectionInto(kind) {
    const view = viewRef.current
    if (!view) return
    setToolbarMenu(null)
    turnBlocksInto(view, selectedBlocks(view), kind)
  }

  function positionInsert(view) {
    if (sourceModeRef.current || blockMenuRef.current) return
    view.requestMeasure({
      key: 'insert-trigger',
      read: () => {
        if (!view.hasFocus || view.state.readOnly || !view.state.selection.main.empty) return null
        const line = view.state.doc.lineAt(view.state.selection.main.head)
        if (line.text.trim()) return null
        if (insideCodeBlock(view.state, line)) return null
        // The empty-body placeholder already explains the / key.
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

  // Opens the block menu ("/") on the cursor line when that line is empty.
  function openInsertMenu(view) {
    const selection = view.state.selection.main
    const line = view.state.doc.lineAt(selection.head)
    if (!selection.empty || line.text.trim() || insideCodeBlock(view.state, line)) return false
    const coords = view.coordsAtPos(selection.head)
    if (!coords) return false
    setInsertAt({
      from: line.from,
      x: coords.left + 4,
      y: coords.top,
      hasBodyPlaceholder: line.number === emptyBodyLine(view.state),
    })
    setBlockMenu(true)
    return true
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

  async function runClipboard(action) {
    const view = viewRef.current
    if (!view) return
    await clipboardAction(view, action, { onPaste: callbacks.current.onPaste })
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
      if (event.target.closest?.('.insert-trigger, .insert-button, .block-menu')) return
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

  function sourceExtensions() {
    return [
      keymap.of([...defaultKeymap, ...historyKeymap, { key: 'Mod-Shift-z', run: redo }]),
      EditorView.contentAttributes.of({
        'aria-label': t('mode.sourceEditor'),
        spellcheck: 'false',
        autocapitalize: 'off',
      }),
    ]
  }

  useLayoutEffect(() => {
    const visualExtensions = [
      documentColors,
      keymap.of([
        {
          key: 'Shift-Home',
          run: (view) => {
            const range = view.state.selection.main
            if (view.state.selection.ranges.length !== 1 || range.head !== view.state.doc.length)
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
              if (!occupied.some((range) => found < range.to && found + text.length > range.from)) {
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
      EditorView.contentAttributes.of({
        'aria-label': t('editor.visual'),
        spellcheck: 'false',
      }),
      EditorView.domEventHandlers({
        keydown: (event, view) => {
          if (view.state.readOnly && !((event.ctrlKey || event.metaKey) && event.key === 'Enter'))
            return false
          if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (openInsertMenu(view)) {
              event.preventDefault()
              return true
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
            pasted && fencedPasteInEmptyBlock(view.state.doc, selection.from, selection.to, pasted)
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
          if (line === event.target && line.querySelector('[data-wiki]') && !view.state.readOnly) {
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
          // A table at the end of the note leaves no line to click below it:
          // a click there starts a new paragraph after the table.
          const end = view.state.doc.lineAt(view.state.doc.length)
          if (
            !line &&
            !view.state.readOnly &&
            event.target.closest?.('.cm-content, .cm-scroller') &&
            tableAt(view.state.doc, end.number)
          ) {
            const lastLine = view.domAtPos(end.to).node
            const lastRow = (lastLine.nodeType === 1 ? lastLine : lastLine.parentElement)?.closest(
              '.cm-line',
            )
            if (lastRow && event.clientY > lastRow.getBoundingClientRect().bottom) {
              event.preventDefault()
              view.focus()
              view.dispatch({
                changes: { from: end.to, insert: view.state.lineBreak.repeat(2) },
                selection: EditorSelection.single(end.to + view.state.lineBreak.length * 2),
                userEvent: 'input',
                scrollIntoView: true,
              })
              return true
            }
          }
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
          event.preventDefault()
          event.stopPropagation()
          openTableMenu(view, table.first, null, {
            cell: { row, column },
            x: event.clientX || cell.getBoundingClientRect().left,
            y: event.clientY || cell.getBoundingClientRect().top,
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
          if (
            !event.relatedTarget?.closest?.(
              '.insert-trigger, .insert-button, .block-menu, .image-insert',
            )
          ) {
            setInsertAt(null)
            setBlockMenu(false)
          }
          return false
        },
      }),
      foldField,
      columnsField,
      columnDrag,
      columnImageHandler.of((files, point) => callbacks.current.onImageFiles?.(files, point)),
      columnReadServices.of({
        onCopy: (text) => callbacks.current.onCopy?.(text),
        onOpenWiki: (target) => callbacks.current.onOpenWiki?.(target),
      }),
      railsLayer,
      tableUi,
      sheet,
      blockHandle,
      liveMarkdown,
      stickyCodeCopy,
      codeCopyHandler.of((source) => callbacks.current.onCopy?.(source)),
    ]
    visualExtensionsRef.current = visualExtensions
    appliedSourceMode.current = sourceModeRef.current
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
          wrappingCompartment.current.of(wrapPage ? EditorView.lineWrapping : []),
          notesCompartment.current.of(taskNotes.of(notes)),
          searchHighlights,
          modeCompartment.current.of(sourceModeRef.current ? sourceExtensions() : visualExtensions),
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
      scrollTo: scrollSnapshot,
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
          '.cm-line, .cm-md-table-cell, button, .format-toolbar, .insert-trigger, .insert-button, .block-menu',
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
    const resize = () => {
      setBlockMenu(false)
      reposition()
    }
    window.addEventListener('resize', resize)
    const layoutObserver = new ResizeObserver(() => {
      view.dispatch({})
      view.requestMeasure()
      reposition()
    })
    layoutObserver.observe(view.dom)
    layoutObserver.observe(view.contentDOM)
    view.scrollDOM.addEventListener('mousedown', focusBlankArea)
    const openInsert = () => openInsertMenu(view)
    view.dom.addEventListener(OPEN_INSERT_EVENT, openInsert)
    callbacks.current.onReady(view)
    return () => {
      view.dom.removeEventListener('pointerup', capturePointerSelection)
      callbacks.current.onReady(null)
      viewRef.current = null
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', resize)
      layoutObserver.disconnect()
      view.scrollDOM.removeEventListener('mousedown', focusBlankArea)
      view.dom.removeEventListener(OPEN_INSERT_EVENT, openInsert)
      view.destroy()
    }
    // The view is recreated per note; later body changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    let cancelled = false
    const apply = () => {
      if (cancelled || viewRef.current !== view) return
      if (view.composing || view.compositionStarted || appliedSourceMode.current === sourceMode)
        return
      appliedSourceMode.current = sourceMode
      view.dispatch({
        effects: modeCompartment.current.reconfigure(
          sourceMode ? sourceExtensions() : visualExtensionsRef.current,
        ),
      })
      setToolbar(null)
      setInsertAt(null)
      setBlockMenu(false)
      setImagePanel(null)
    }
    const onCompositionEnd = () => setTimeout(apply, 0)
    view.contentDOM.addEventListener('compositionend', onCompositionEnd)
    apply()
    return () => {
      cancelled = true
      view.contentDOM.removeEventListener('compositionend', onCompositionEnd)
    }
  }, [sourceMode, noteId])

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
      className={`visual-editor${sourceMode ? ' source-mode' : ''}${readOnly ? ' read-only' : ''}${blockMenu ? ' block-menu-open' : ''}`}
      data-wrap-page={wrapPage}
      ref={host}
    >
      {outline && !sourceMode && (
        <DocumentOutline
          body={body}
          onNavigate={(anchor) => {
            const view = viewRef.current
            if (!view) return
            view.dispatch({
              selection: { anchor },
              effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 80 }),
            })
            view.focus()
          }}
        />
      )}
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
            <>
              {toolbar.inCode &&
                clipboardButtons.map(([action, label, icon, keys]) => (
                  <ShortcutButton
                    key={action}
                    type="button"
                    label={t(label)}
                    keys={keys}
                    onClick={() => runClipboard(action)}
                  >
                    {icon}
                  </ShortcutButton>
                ))}
              <details
                className="document-color-menu"
                onToggle={(event) => {
                  if (!event.currentTarget.open) return
                  const box = event.currentTarget.getBoundingClientRect()
                  const panel = event.currentTarget.querySelector('.document-color-panel')
                  panel.style.left = `${Math.max(8, Math.min(box.left, innerWidth - panel.offsetWidth - 8)) - box.left}px`
                  panel.style.top = `${Math.max(8, Math.min(box.bottom + 8, innerHeight - panel.offsetHeight - 8)) - box.top}px`
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    event.currentTarget.open = false
                    viewRef.current?.focus()
                  }
                }}
              >
                <summary
                  onMouseDown={(event) => event.preventDefault()}
                  aria-label={t('colors.title')}
                >
                  A
                </summary>
                <div
                  className="document-color-panel"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {!toolbar.inCode && (
                    <div className="color-scope" role="group" aria-label={t('colors.applyTo')}>
                      {['text', 'block'].map((scope) => (
                        <button
                          type="button"
                          key={scope}
                          aria-pressed={colorScope === scope}
                          onClick={() => setColorScope(scope)}
                        >
                          {t(`colors.scope.${scope}`)}
                        </button>
                      ))}
                    </div>
                  )}
                  <ColorPalette
                    value={
                      toolbar.inCode || colorScope === 'block'
                        ? toolbar.blockColors
                        : toolbar.colors
                    }
                    onChange={(property, color) => {
                      const view = viewRef.current
                      if (toolbar.inCode || colorScope === 'block')
                        for (const block of [...selectedBlocks(view)].reverse())
                          colorBlock(view, block, property, color)
                      else colorDocument(view, property, color)
                    }}
                    onReset={() => {
                      const view = viewRef.current
                      if (toolbar.inCode || colorScope === 'block')
                        for (const block of [...selectedBlocks(view)].reverse())
                          colorBlock(view, block, 'reset')
                      else colorDocument(view, 'reset')
                    }}
                  />
                </div>
              </details>
              {!toolbar.inCode && toolbar.kind && (
                <>
                  <button
                    type="button"
                    className={`format-menu-trigger${toolbarMenu === 'type' ? ' open' : ''}`}
                    aria-label={t('format.turnInto', { block: t(`block.${toolbar.kind}`) })}
                    title={t('format.turnInto', { block: t(`block.${toolbar.kind}`) })}
                    aria-haspopup="menu"
                    aria-expanded={toolbarMenu === 'type'}
                    onClick={() => setToolbarMenu(toolbarMenu === 'type' ? null : 'type')}
                  >
                    <span
                      className="format-menu-icon"
                      dangerouslySetInnerHTML={{ __html: blockIconMarkup[toolbar.kind] }}
                    />
                    <ChevronDown size={12} aria-hidden="true" />
                  </button>
                  <span className="format-separator" aria-hidden="true" />
                </>
              )}
              {!toolbar.inCode &&
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
                ))}
              {!toolbar.inCode && (
                <>
                  <span className="format-separator" aria-hidden="true" />
                  <button
                    type="button"
                    className={`format-menu-trigger${toolbarMenu === 'more' ? ' open' : ''}`}
                    aria-label={t('format.more')}
                    title={t('format.more')}
                    aria-haspopup="menu"
                    aria-expanded={toolbarMenu === 'more'}
                    onClick={() => setToolbarMenu(toolbarMenu === 'more' ? null : 'more')}
                  >
                    <Ellipsis size={16} aria-hidden="true" />
                  </button>
                </>
              )}
              {toolbarMenu && (
                <div
                  className={`format-dropdown format-dropdown-${toolbarMenu}`}
                  role="menu"
                  aria-label={t(toolbarMenu === 'type' ? 'block.turnInto' : 'format.more')}
                  onKeyDown={(event) => {
                    const buttons = [...event.currentTarget.querySelectorAll('button')]
                    const index = buttons.indexOf(document.activeElement)
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault()
                      const step = event.key === 'ArrowDown' ? 1 : buttons.length - 1
                      buttons[(index + step) % buttons.length]?.focus()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setToolbarMenu(null)
                      viewRef.current?.focus()
                    }
                  }}
                >
                  {toolbarMenu === 'type'
                    ? TURN_INTO.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          role="menuitemradio"
                          aria-checked={kind === toolbar.kind}
                          onClick={() => turnSelectionInto(kind)}
                        >
                          <span
                            className="format-menu-icon"
                            dangerouslySetInnerHTML={{ __html: blockIconMarkup[kind] }}
                          />
                          <span className="menu-item-label">{t(`block.${kind}`)}</span>
                          {kind === toolbar.kind && <Check size={14} aria-hidden="true" />}
                        </button>
                      ))
                    : clipboardButtons.map(([action, label, icon, keys]) => (
                        <button
                          key={action}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setToolbarMenu(null)
                            runClipboard(action)
                          }}
                        >
                          <span className="format-menu-icon">{icon}</span>
                          <span className="menu-item-label">{t(label)}</span>
                          <Shortcut keys={keys} />
                        </button>
                      ))}
                </div>
              )}
            </>
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
          <button
            type="button"
            className="insert-button"
            aria-label={t('editor.insertBlock')}
            title={t('editor.insertBlock')}
            aria-expanded={blockMenu}
            style={{ left: Math.max(4, insertAt.x - 38), top: insertAt.y }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setBlockMenu(!blockMenu)}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M10 4.5v11M4.5 10h11" />
            </svg>
          </button>
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
    </div>
  )
}
