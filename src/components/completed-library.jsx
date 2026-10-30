import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import { matchesNote } from './note-list.jsx'
import { displayName, notePreview } from '../note-title.js'
import { t } from '../i18n.js'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function CompletedLibrary({ notes, query, onOpen, onReopen, onTrash }) {
  const [menu, setMenu] = useState(null)
  const first = useRef(null)
  useEffect(() => {
    if (!menu) return
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && event.target.closest('.completed-context-menu')) return
      setMenu(null)
    }
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', dismiss, true)
    const frame = requestAnimationFrame(() => first.current?.focus())
    return () => {
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('keydown', dismiss, true)
      cancelAnimationFrame(frame)
    }
  }, [menu])
  const shown = notes
    .filter((note) => matchesNote(note, query))
    .sort((a, b) => b.completedAt - a.completedAt)
  return (
    <section className="trash-library" aria-label={t('completed.title')}>
      {shown.length ? (
        shown.map((note) => (
          <article
            className="trash-library-item"
            key={note.id}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenu({
                id: note.id,
                x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
                y: Math.max(8, Math.min(event.clientY, window.innerHeight - 120)),
              })
            }}
          >
            <button className="note-item trash-library-text" onClick={() => onOpen(note.id)}>
              <span className="note-title">{displayName(note.name)}</span>
              <span className="note-preview">{notePreview(note.body)}</span>
            </button>
            <div className="trash-library-actions">
              <button
                className="icon-button"
                title={t('completed.reopen')}
                aria-label={t('completed.reopen')}
                onClick={() => onReopen(note.id)}
              >
                <RotateCcw size={14} />
              </button>
              <button
                className="icon-button danger"
                title={t('library.trash')}
                aria-label={t('library.trash')}
                onClick={() => onTrash(note.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </article>
        ))
      ) : (
        <div className="empty-state">
          <CheckCircle2 size={22} />
          <p>{t(notes.length ? 'library.noResults' : 'completed.empty')}</p>
        </div>
      )}
      {menu &&
        createPortal(
          <div
            className="tab-context-menu completed-context-menu"
            role="menu"
            aria-label={t('library.menu')}
            style={{ left: menu.x, top: menu.y }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
              event.preventDefault()
              const buttons = [...event.currentTarget.querySelectorAll('button')]
              const index = buttons.indexOf(document.activeElement)
              buttons[
                (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
              ]?.focus()
            }}
          >
            <button
              ref={first}
              role="menuitem"
              onClick={() => {
                const id = menu.id
                setMenu(null)
                onReopen(id)
              }}
            >
              <RotateCcw size={15} aria-hidden="true" />
              <span>{t('completed.reopen')}</span>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                const id = menu.id
                setMenu(null)
                onTrash(id)
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>{t('library.trash')}</span>
            </button>
          </div>,
          document.body,
        )}
    </section>
  )
}
