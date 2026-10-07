import { clipboardImageFiles } from './clipboard.js'
import { ImageInsert } from './components/image-insert.jsx'
import { ensureTitle, mandatoryTitle, navigateTitle } from './title.js'
import { inlineSyntax } from './live-markdown.js'
import { liveMarkdown } from './editor/live-decorations.js'
import { codeCopyHandler, stickyCodeCopy } from './editor/code-copy.js'
import {
  insertTableColumnAt,
  insertTableRowAt,
  moveTable,
  removeTableColumnAt,
  removeTableRowAt,
  tableAt,
} from './editor/table.js'
import { continueList, navigateToFence, wrapSelectedText } from './editor/keys.js'
import { useEffect, useRef, useState } from 'react'
import { t } from './i18n.js'
import { flushSync } from 'react-dom'
import { EditorSelection, EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorView, keymap } from '@codemirror/view'
import { activeFormats, formatSelection } from './format-selection.js'
import { blockTemplate } from './insert-block.js'
import { fencedPasteInEmptyBlock } from './fenced-paste.js'
import {
  ArrowDownToLine,
  ArrowRightToLine,
  CodeXml,
  ImagePlus,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Trash2,
} from 'lucide-react'

/* eslint-disable react/jsx-key -- static tuples, rendered with explicit keys below */

const formatButtons = [
  ['bold', 'format.bold', <strong>B</strong>],
  ['italic', 'format.italic', <em>I</em>],
  ['code', 'format.code', <span className="format-code">&lt;/&gt;</span>],
  ['link', 'format.link', <span aria-hidden="true">↗</span>],
  ['heading', 'format.heading', <span>H₂</span>],
  ['quote', 'format.quote', <span>❝</span>],
  ['list', 'format.list', <span>☷</span>],
]
/* eslint-enable react/jsx-key */
const blockButtons = [
  ['h2', 'block.h2'],
  ['h3', 'block.h3'],
  ['h4', 'block.h4'],
  ['quote', 'block.quote'],
  ['list', 'block.list'],
  ['numbered', 'block.numbered'],
  ['table', 'block.table'],
  ['code', 'block.code'],
  ['image', 'block.image'],
]

function TableMenuIcon({ kind }) {
  const props = { size: 16, 'aria-hidden': true }
  if (kind === 'row') return <ArrowDownToLine {...props} />
  if (kind === 'column') return <ArrowRightToLine {...props} />
  return <Trash2 {...props} />
}

const blockIcons = {
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  quote: Quote,
  list: List,
  numbered: ListOrdered,
  table: TableIcon,
  code: CodeXml,
  image: ImagePlus,
}

function BlockIcon({ action }) {
  const Icon = blockIcons[action]
  if (!Icon) return null
  return <Icon className="block-icon" aria-hidden="true" />
}

export function VisualEditor({
  noteId,
  body,
  onChange,
  onReady,
  onOpenWiki,
  onImageFiles,
  onImageUrl,
  onCopy,
  imageBusy,
}) {
  const host = useRef(null),
    viewRef = useRef(null),
    syncing = useRef(false)
  const [toolbar, setToolbar] = useState(null)
  const [insertAt, setInsertAt] = useState(null)
  const [blockMenu, setBlockMenu] = useState(false)
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
    onOpenWiki,
    onImageFiles,
    onImageUrl,
    imageBusy,
    onCopy,
  })
  callbacks.current = { onChange, onReady, onOpenWiki, onImageFiles, onImageUrl, imageBusy, onCopy }

  function positionToolbar(view) {
    const selection = view.state.selection.main
    if (selection.empty || !view.hasFocus) {
      setToolbar(null)
      return
    }
    const start = view.coordsAtPos(selection.from),
      end = view.coordsAtPos(selection.to)
    if (!start || !end) {
      setToolbar(null)
      return
    }
    if (start.top < 48 || start.top > window.innerHeight) {
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
        if (!view.hasFocus || !view.state.selection.main.empty) return null
        const line = view.state.doc.lineAt(view.state.selection.main.head)
        if (line.text.trim()) return null
        const coords = view.coordsAtPos(line.from)
        if (!coords || coords.top < 48 || coords.top > window.innerHeight) return null
        return { from: line.from, x: Math.max(5, coords.left - 34), y: coords.top }
      },
      write: (position) => {
        if (blockMenuRef.current) return
        setInsertAt(position)
      },
    })
  }

  function insertBlock(action) {
    const view = viewRef.current,
      template = blockTemplate(action)
    if (!view || !template || !insertAt) return
    view.dispatch({
      changes: { from: insertAt.from, insert: template.text },
      selection: EditorSelection.single(
        insertAt.from + template.selectionFrom,
        insertAt.from + template.selectionTo,
      ),
      userEvent: 'input.type',
    })
    setBlockMenu(false)
    setInsertAt(null)
    view.focus()
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
      userEvent: 'input.type',
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
    if (blockMenu) host.current?.querySelector('.block-menu button')?.focus()
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

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: ensureTitle(body),
        selection: { anchor: 2 },
        extensions: [
          mandatoryTitle,
          history(),
          keymap.of([
            { key: 'Enter', run: (view) => moveTable(view, 'enter') },
            { key: 'Shift-Enter', run: (view) => moveTable(view, 'shift-enter') },
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
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            'aria-label': t('editor.visual'),
            spellcheck: 'false',
          }),
          EditorView.domEventHandlers({
            keydown: (event, view) => {
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
              return wrapSelectedText(event, view)
            },
            paste: (event, view) => {
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
              const wiki = event.target.closest?.('[data-wiki]')
              if (wiki) {
                event.preventDefault()
                event.stopPropagation()
                callbacks.current.onOpenWiki?.(wiki.dataset.wiki)
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
              if (!event.relatedTarget?.closest?.('.insert-trigger, .block-menu')) {
                setInsertAt(null)
                setBlockMenu(false)
              }
              return false
            },
          }),
          liveMarkdown,
          stickyCodeCopy,
          codeCopyHandler.of((source) => callbacks.current.onCopy?.(source)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !syncing.current)
              callbacks.current.onChange(update.state.doc.toString())
            if (update.selectionSet || update.docChanged || update.viewportChanged) {
              positionToolbar(update.view)
              positionInsert(update.view)
            }
          }),
        ],
      }),
      parent: host.current,
    })
    viewRef.current = view
    const focusBlankArea = (event) => {
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
    view.scrollDOM.addEventListener('mousedown', focusBlankArea)
    callbacks.current.onReady(view)
    return () => {
      callbacks.current.onReady(null)
      viewRef.current = null
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      view.scrollDOM.removeEventListener('mousedown', focusBlankArea)
      view.destroy()
    }
    // The view is recreated per note; later body changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === body) return
    syncing.current = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: body } })
    syncing.current = false
  }, [body])

  return (
    <div className="visual-editor" ref={host}>
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
              <button
                type="submit"
                aria-label={t('editor.linkApply')}
                title={t('editor.linkApply')}
              >
                ↗
              </button>
            </form>
          ) : (
            formatButtons.map(([action, label, icon]) => (
              <button
                key={action}
                type="button"
                title={t(label)}
                aria-label={t(label)}
                aria-pressed={toolbar.active.includes(action)}
                className={toolbar.active.includes(action) ? 'active' : undefined}
                onClick={() =>
                  action === 'link' && !toolbar.active.includes('link')
                    ? setLinkEditing(true)
                    : applyFormat(action)
                }
              >
                {icon}
              </button>
            ))
          )}
        </div>
      )}
      {insertAt && (
        <>
          <button
            type="button"
            className="insert-trigger"
            aria-label={t('editor.insertBlock')}
            aria-expanded={blockMenu}
            title={t('editor.insertBlock')}
            style={{ left: insertAt.x, top: insertAt.y }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setBlockMenu((value) => !value)}
          >
            +
          </button>
          {blockMenu && (
            <div
              className="block-menu"
              role="menu"
              aria-label={t('editor.insertBlock')}
              style={{
                left: Math.max(8, insertAt.x),
                top: Math.max(
                  52,
                  Math.min(
                    insertAt.y + 30,
                    window.innerHeight - Math.min(350, window.innerHeight * 0.6) - 8,
                  ),
                ),
              }}
              onMouseDown={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                const buttons = [...event.currentTarget.querySelectorAll('button')]
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
                  setBlockMenu(false)
                  viewRef.current?.focus()
                }
                if (event.key === 'Tab') setBlockMenu(false)
              }}
            >
              {blockButtons.map(([action, label]) => (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (action === 'image') {
                      const selection = viewRef.current.state.selection.main
                      setImagePanel({ from: selection.from, to: selection.to })
                      setBlockMenu(false)
                    } else insertBlock(action)
                  }}
                >
                  <BlockIcon action={action} />
                  <span>{t(label)}</span>
                </button>
              ))}
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
