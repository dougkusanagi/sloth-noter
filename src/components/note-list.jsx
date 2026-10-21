import { notePreview, displayName } from '../note-title.js'
import { t } from '../i18n.js'

import { noteSearchResult } from '../note-search.js'
export { matchesNote } from '../note-search.js'

export function NoteList({
  notes,
  query,
  activeId,
  openIds,
  onOpen,
  onKeep,
  onMenu,
  onSearchOpen,
}) {
  const searching = Boolean(query.trim())
  const shown = notes
    .map((note) => ({ note, result: noteSearchResult(note, query) }))
    .filter(({ result }) => !searching || result.matches.length || result.titleMatches.length)
  if (!shown.length) return <p className="sidebar-empty">{t('library.noResults')}</p>
  return shown.map(({ note, result }) => {
    const preview = notePreview(note.body)
    return (
      <button
        key={note.id}
        className="note-item"
        title={note.name}
        aria-label={displayName(note.name)}
        aria-current={note.id === activeId ? 'page' : undefined}
        data-open={openIds.includes(note.id) || undefined}
        onClick={() =>
          searching && result.matches.length ? onSearchOpen(note.id, query.trim()) : onOpen(note.id)
        }
        onDoubleClick={() => onKeep(note.id)}
        onContextMenu={(event) => onMenu(event, note.id)}
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
    )
  })
}
