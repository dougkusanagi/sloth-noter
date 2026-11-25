import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { EditorView } from '@codemirror/view'
import { replacementText, searchNote } from '../find.js'
import { t } from '../i18n.js'

/**
 * Compact find & replace bar for mobile editing mode (A9).
 * All replacements dispatch CodeMirror transactions so Undo reverts them cleanly.
 */
export function EditorFind({ view, body, initialQuery = '', onClose }) {
  const [query, setQuery] = useState(initialQuery)
  const [replacement, setReplacement] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const result = useMemo(() => searchNote(body, query), [body, query])
  const matches = result.matches
  const current = matches.length ? ((index % matches.length) + matches.length) % matches.length : 0

  function reveal(nextIndex) {
    if (!view || !matches.length) return
    const target = matches[((nextIndex % matches.length) + matches.length) % matches.length]
    view.dispatch({
      selection: { anchor: target.start, head: target.end },
      effects: EditorView.scrollIntoView(target.start, { y: 'center' }),
    })
  }

  function step(delta) {
    if (!matches.length) return
    const next = (current + delta + matches.length) % matches.length
    setIndex(next)
    reveal(next)
  }

  function replaceCurrent() {
    if (!view || !matches.length) return
    const match = matches[current]
    const insert = replacementText(body, match, replacement)
    view.dispatch({
      changes: { from: match.start, to: match.end, insert },
      selection: { anchor: match.start + insert.length },
      userEvent: 'input.replace',
      scrollIntoView: true,
    })
  }

  function replaceAll() {
    if (!view || !matches.length) return
    const changes = matches.map((match) => ({
      from: match.start,
      to: match.end,
      insert: replacementText(body, match, replacement),
    }))
    view.dispatch({
      changes,
      userEvent: 'input.replaceAll',
    })
  }

  return (
    <div className="mobile-editor-find" role="search" aria-label={t('find.label')}>
      <div className="mobile-find-row">
        <input
          ref={inputRef}
          type="search"
          value={query}
          aria-label={t('find.input')}
          placeholder={t('find.placeholder')}
          onChange={(event) => {
            setQuery(event.target.value)
            setIndex(0)
          }}
        />
        <output aria-live="polite">
          {query ? (matches.length ? `${current + 1}/${matches.length}` : '0/0') : ''}
        </output>
        <button
          type="button"
          className="mobile-icon"
          aria-label={t('find.previous')}
          disabled={!matches.length}
          onClick={() => step(-1)}
        >
          <ChevronUp size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="mobile-icon"
          aria-label={t('find.next')}
          disabled={!matches.length}
          onClick={() => step(1)}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="mobile-icon"
          aria-label={t('dialog.close')}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="mobile-find-row">
        <input
          type="text"
          value={replacement}
          aria-label={t('find.replacement')}
          placeholder={t('find.replacement')}
          onChange={(event) => setReplacement(event.target.value)}
        />
        <button type="button" disabled={!matches.length} onClick={replaceCurrent}>
          {t('find.replace')}
        </button>
        <button type="button" disabled={!matches.length} onClick={replaceAll}>
          {t('find.replaceAll')}
        </button>
      </div>
    </div>
  )
}
