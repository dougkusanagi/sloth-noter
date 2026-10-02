import { notePreview, displayName } from '../note-title.js'
import { t } from '../i18n.js'

export function matchesNote(note, query) {
  const needle = query.trim().toLocaleLowerCase()
  return (
    !needle ||
    note.name.toLocaleLowerCase().includes(needle) ||
    note.body.toLocaleLowerCase().includes(needle)
  )
}

export function NoteList({ notes, query, activeId, openIds, onOpen, onMenu }) {
  const shown = notes.filter((note) => matchesNote(note, query))
  if (!shown.length) return <p className="sidebar-empty">{t('library.noResults')}</p>
  return shown.map((note) => {
    const preview = notePreview(note.body)
    return (
      <button
        key={note.id}
        className="note-item"
        title={note.name}
        aria-label={displayName(note.name)}
        aria-current={note.id === activeId ? 'page' : undefined}
        data-open={openIds.includes(note.id) || undefined}
        onClick={() => onOpen(note.id)}
        onContextMenu={(event) => onMenu(event, note.id)}
      >
        <span className="note-title">{displayName(note.name)}</span>
        {preview && <span className="note-preview">{preview}</span>}
      </button>
    )
  })
}
