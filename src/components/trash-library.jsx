import { RotateCcw, Trash2 } from 'lucide-react'
import { matchesNote } from './note-list.jsx'
import { displayName, notePreview } from '../note-title.js'
import { t } from '../i18n.js'

export function TrashLibrary({ trash, query, onRestore, onPurge }) {
  const shown = trash.filter(({ note }) => matchesNote(note, query))
  return (
    <section className="trash-library" aria-label={t('trash.title')}>
      {shown.length ? (
        shown.map(({ note }) => (
          <article className="trash-library-item" key={note.id} aria-label={displayName(note.name)}>
            <span className="note-title">{displayName(note.name)}</span>
            <span className="note-preview">{notePreview(note.body)}</span>
            <div className="trash-library-actions">
              <button className="button" onClick={() => onRestore(note.id)}>
                <RotateCcw size={13} aria-hidden="true" />
                {t('trash.restore')}
              </button>
              <button className="button danger" onClick={() => onPurge(note.id)}>
                <Trash2 size={13} aria-hidden="true" />
                {t('trash.purge')}
              </button>
            </div>
          </article>
        ))
      ) : (
        <p className="sidebar-empty">{t(trash.length ? 'library.noResults' : 'trash.empty')}</p>
      )}
    </section>
  )
}
