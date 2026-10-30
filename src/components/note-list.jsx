import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, FilePlus, FileText, Folder, FolderPlus, Pencil, Trash2, CheckCircle2 } from 'lucide-react'
import { noteTasks } from '../tasks.js'
import { notePreview, displayName } from '../note-title.js'
import { t } from '../i18n.js'

import { noteSearchResult } from '../note-search.js'
export { matchesNote } from '../note-search.js'

/** Rename field shown in place of a folder's title; Enter or blur commits, Escape cancels. */
function FolderNameInput({ name, onDone }) {
  const [value, setValue] = useState(name)
  const finished = useRef(false)
  const finish = (commit) => {
    if (finished.current) return
    finished.current = true
    onDone(commit ? value : name)
  }
  return (
    <input
      className="folder-name-input"
      autoFocus
      aria-label={t('library.folderNameLabel')}
      value={value}
      onFocus={(event) => event.target.select()}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') finish(true)
        if (event.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
    />
  )
}

export function NoteList({
  notes,
  groups = [],
  sort = 'recent',
  query,
  activeId,
  openIds,
  onOpen,
  onKeep,
  onSearchOpen,
  onMoveGroup,
  renamingGroup,
  onStartRenameGroup,
  onRenameGroup,
  onTrashGroup,
  onCreateNote,
  onCreateGroup,
  onRenameNote,
  onTrashNote,
  onCompleteNote,
}) {
  const searching = Boolean(query.trim())
  const [menu, setMenu] = useState(null)
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const suppressClick = useRef(false)
  const menuFirst = useRef(null)

  useEffect(() => {
    if (!menu) return
    const onPointer = (event) => {
      if (!event.target.closest('.library-context-menu')) setMenu(null)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenu(null)
      }
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    const frame = requestAnimationFrame(() => menuFirst.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

  // Pointer-based drag: the desktop webview routes native drag events elsewhere.
  function startDrag(event, id) {
    if (event.button !== 0) return
    suppressClick.current = false
    dragRef.current = { id, x: event.clientX, y: event.clientY, active: false, over: null }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveDrag(event) {
    const state = dragRef.current
    if (!state) return
    if (!state.active) {
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 6) return
      state.active = true
      suppressClick.current = true
      setMenu(null)
    }
    // The list root comes first in the DOM, so the last hit is the innermost folder.
    const root = event.currentTarget.closest('.note-list')
    const hits = [root, ...root.querySelectorAll('[data-drop-group]')].filter((element) => {
      const box = element.getBoundingClientRect()
      return (
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      )
    })
    state.over = hits.length ? hits.at(-1).dataset.dropGroup : null
    setDrag({ id: state.id, over: state.over, x: event.clientX, y: event.clientY })
  }
  function endDrag(event, cancelled = false) {
    const state = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (cancelled || !state?.active || state.over === null) return
    const note = notes.find((item) => item.id === state.id)
    if (note && (groupOf(note) ?? '') !== state.over) onMoveGroup(state.id, state.over)
  }
  // Notes pointing at a folder that no longer exists are shown loose.
  const groupOf = (note) => (groups.includes(note.group) ? note.group : undefined)

  function openMenu(event, target) {
    event.preventDefault()
    event.stopPropagation()
    setMenu({
      target,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 248)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 200)),
    })
  }
  function runMenu(action) {
    const { target } = menu
    setMenu(null)
    action(target)
  }

  const shown = notes
    .map((note) => ({ note, result: noteSearchResult(note, query) }))
    .filter(({ result }) => !searching || result.matches.length || result.titleMatches.length)
    .sort((a, b) =>
      sort === 'alphabetical'
        ? displayName(a.note.name).localeCompare(displayName(b.note.name), undefined, {
            sensitivity: 'base',
            numeric: true,
          })
        : (b.note.modifiedAt ?? 0) - (a.note.modifiedAt ?? 0),
    )
  const renderNote = ({ note, result }) => {
    const preview = notePreview(note.body)
    return (
      <div
        className="note-list-row"
        key={note.id}
        data-dragging={drag?.id === note.id || undefined}
      >
        <button
          className="note-item"
          title={note.name}
          aria-label={displayName(note.name)}
          aria-current={note.id === activeId ? 'page' : undefined}
          data-open={openIds.includes(note.id) || undefined}
          onPointerDown={(event) => startDrag(event, note.id)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={(event) => endDrag(event, true)}
          onClickCapture={(event) => {
            if (!suppressClick.current) return
            suppressClick.current = false
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={() =>
            searching && result.matches.length
              ? onSearchOpen(note.id, query.trim())
              : onOpen(note.id)
          }
          onDoubleClick={() => onKeep(note.id)}
          onContextMenu={(event) => openMenu(event, { type: 'note', id: note.id })}
        >
          <span className="note-title">{displayName(note.name)}</span>
          {result.snippet ? (
            <span className="note-preview note-search-snippet">
              {result.snippet.before}
              <mark>{result.snippet.hit}</mark>
              {result.snippet.after}
            </span>
          ) : (
            preview && <span className="note-preview">{preview}</span>
          )}
          {searching && result.matches.length > 0 && (
            <span className="note-search-count">
              {t(result.matches.length === 1 ? 'library.matches.one' : 'library.matches', {
                count: result.matches.length,
              })}
            </span>
          )}
        </button>
      </div>
    )
  }

  const loose = shown.filter(({ note }) => !groupOf(note))
  const visibleGroups = groups.filter(
    (group) => !searching || shown.some(({ note }) => groupOf(note) === group),
  )
  if (!loose.length && !visibleGroups.length)
    return (
      <div
        className="note-list"
        data-drop-group=""
        onContextMenu={(e) => openMenu(e, { type: 'empty' })}
      >
        <p className="sidebar-empty">{t('library.noResults')}</p>
        {contextMenu()}
      </div>
    )

  function contextMenu() {
    if (!menu) return null
    const { target } = menu
    const group =
      target.type === 'group'
        ? target.name
        : target.type === 'note'
          ? groupOf(notes.find((note) => note.id === target.id) ?? {})
          : undefined
    const items = [
      [FilePlus, t('menu.newNote'), () => onCreateNote(group)],
      [FolderPlus, t('library.newFolder'), () => onCreateGroup()],
    ]
    if (target.type === 'note')
      items.push(
        null,
        [Pencil, t('library.rename'), () => onRenameNote(target.id)],
        ...(noteTasks(notes.find((note) => note.id === target.id)?.body ?? '').length
          ? [[CheckCircle2, t('completed.complete'), () => onCompleteNote(target.id)]]
          : []),
        [Trash2, t('library.trash'), () => onTrashNote(target.id)],
      )
    if (target.type === 'group')
      items.push(
        null,
        [Pencil, t('library.renameFolder'), () => onStartRenameGroup(target.name)],
        [Trash2, t('library.trashFolder'), () => onTrashGroup(target.name)],
      )
    return createPortal(
      <div
        className="tab-context-menu library-context-menu"
        role="menu"
        aria-label={t('library.menu')}
        style={{ left: menu.x, top: menu.y }}
        onKeyDown={(event) => {
          const buttons = [...event.currentTarget.querySelectorAll('button')]
          const index = buttons.indexOf(document.activeElement)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            buttons[
              (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
            ]?.focus()
          }
        }}
      >
        {items.map((item, index) =>
          item ? (
            <button
              key={item[1]}
              ref={index === 0 ? menuFirst : undefined}
              type="button"
              role="menuitem"
              onClick={() => runMenu(item[2])}
            >
              {(() => {
                const Icon = item[0]
                return <Icon size={15} aria-hidden="true" />
              })()}
              <span>{item[1]}</span>
            </button>
          ) : (
            <div className="table-context-menu-separator" key={index} />
          ),
        )}
      </div>,
      document.body,
    )
  }

  return (
    <div
      className="note-list"
      data-drop-group=""
      data-dragging={drag ? '' : undefined}
      data-drop-over={
        (drag?.over === '' && groupOf(notes.find((note) => note.id === drag.id) ?? {})) ||
        undefined
      }
      onContextMenu={(event) => openMenu(event, { type: 'empty' })}
    >
      {visibleGroups.map((group) => {
        const members = shown.filter(({ note }) => groupOf(note) === group)
        return (
          <details
            className="note-group"
            key={group}
            open
            data-drop-group={group}
            data-drop-over={drag?.over === group || undefined}
            onContextMenu={(event) => openMenu(event, { type: 'group', name: group })}
          >
            <summary>
              {renamingGroup === group ? (
                <>
                  <ChevronRight className="folder-chevron" size={13} aria-hidden="true" />
                  <Folder className="folder-icon" size={14} aria-hidden="true" />
                  <FolderNameInput name={group} onDone={(name) => onRenameGroup(group, name)} />
                </>
              ) : (
                <>
                  <ChevronRight className="folder-chevron" size={13} aria-hidden="true" />
                  <Folder className="folder-icon" size={14} aria-hidden="true" />
                  <span className="folder-name">{group}</span>
                  <span className="count">{members.length}</span>
                </>
              )}
            </summary>
            {members.map(renderNote)}
          </details>
        )
      })}
      {loose.map(renderNote)}
      {contextMenu()}
      {drag &&
        createPortal(
          <div className="note-drag-ghost" style={{ left: drag.x, top: drag.y }}>
            <FileText size={14} aria-hidden="true" />
            <span>{displayName(notes.find((note) => note.id === drag.id)?.name ?? '')}</span>
          </div>,
          document.body,
        )}
    </div>
  )
}
