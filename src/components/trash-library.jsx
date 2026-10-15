import { RotateCcw, Trash2 } from 'lucide-react'
import { matchesNote } from './note-list.jsx'
import { displayName, notePreview } from '../note-title.js'
import { currentLanguage, t } from '../i18n.js'

const UNITS = [
  ['year', 365 * 24 * 3600e3],
  ['month', 30 * 24 * 3600e3],
  ['week', 7 * 24 * 3600e3],
  ['day', 24 * 3600e3],
  ['hour', 3600e3],
  ['minute', 60e3],
]

/** "3 days ago", in the interface language. */
export function relativeTime(time, now = Date.now(), language = currentLanguage()) {
  const elapsed = time - now
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  for (const [unit, size] of UNITS)
    if (Math.abs(elapsed) >= size) return format.format(Math.round(elapsed / size), unit)
  return format.format(0, 'minute')
}

export function TrashLibrary({ trash, query, onRestore, onPurge }) {
  const shown = trash
    .filter(({ note }) => matchesNote(note, query))
    .sort((a, b) => b.deletedAt - a.deletedAt)
  return (
    <section className="trash-library" aria-label={t('trash.title')}>
      {shown.length ? (
        shown.map(({ note, deletedAt }) => (
          <article className="trash-library-item" key={note.id} aria-label={displayName(note.name)}>
            <div className="trash-library-text">
              <span className="note-title">{displayName(note.name)}</span>
              <span className="note-preview">
                {t('trash.deleted', { when: relativeTime(deletedAt) })}
                {notePreview(note.body) && ` · ${notePreview(note.body)}`}
              </span>
            </div>
            <div className="trash-library-actions">
              <button
                className="icon-button"
                aria-label={t('trash.restore')}
                title={t('trash.restore')}
                onClick={() => onRestore(note.id)}
              >
                <RotateCcw size={14} aria-hidden="true" />
              </button>
              <button
                className="icon-button danger"
                aria-label={t('trash.purge')}
                title={t('trash.purge')}
                onClick={() => onPurge(note.id)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </article>
        ))
      ) : (
        <div className="empty-state">
          <Trash2 size={22} aria-hidden="true" />
          <p>{t(trash.length ? 'library.noResults' : 'trash.empty')}</p>
        </div>
      )}
    </section>
  )
}
