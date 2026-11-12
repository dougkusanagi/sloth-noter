import { useState } from 'react'
import { redo } from '@codemirror/commands'
import { blockEdit } from '../insert-block.js'
import { shortcutEdit } from '../editor-shortcuts.js'
import { t } from '../i18n.js'
import { displayName } from '../note-title.js'

const blocks = [
  ['h2', 'block.h2', '## Título'],
  ['h3', 'block.h3', '### Título'],
  ['h4', 'block.h4', '#### Título'],
  ['list', 'block.list', '• Item'],
  ['numbered', 'block.numbered', '1. Item'],
  ['task', 'block.task', '☐ Tarefa'],
  ['table', 'block.table', '| A | B |'],
  ['code', 'block.code', '``` código'],
  ['quote', 'block.quote', '> Citação'],
  ['image', 'block.image', '▧'],
  ['link', 'format.link', '[texto](url)'],
  ['wiki', 'mobile.noteLink', '[[Nota]]'],
  ['divider', 'mobile.divider', '───'],
  ['date', 'mobile.today', 'dd/mm/aaaa'],
  ['accordion', 'block.accordion', '▸ Conteúdo'],
  ['columns', 'block.columns', 'A  |  B'],
]

export function EditingSheet({ view, notes, onClose, onImage }) {
  const [linking, setLinking] = useState(false)
  const [query, setQuery] = useState('')
  function insert(action, note) {
    if (!view || view.composing || view.compositionStarted) return
    if (action === 'wiki') {
      setLinking(true)
      return
    }
    if (action === 'image') {
      onImage()
      return
    }
    const { from, to } = view.state.selection.main
    const text = view.state.doc.toString()
    const edit = note
      ? {
          from,
          to,
          insert: `[[${displayName(note.name)}]]`,
          selectionFrom: from + displayName(note.name).length + 4,
          selectionTo: from + displayName(note.name).length + 4,
        }
      : action === 'link'
        ? shortcutEdit(text, from, to, 'link')
        : blockEdit(text, from, to, action)
    if (!edit) return
    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: { anchor: edit.selectionFrom, head: edit.selectionTo },
      userEvent: 'input',
      scrollIntoView: true,
    })
    onClose()
    view.focus()
  }
  return (
    <>
      <button
        onClick={() => {
          if (!view.composing && !view.compositionStarted) {
            redo(view)
            onClose()
            view.focus()
          }
        }}
      >
        {t('mobile.redo')}
      </button>
      {linking ? (
        <>
          <label>
            {t('mobile.noteLink')}
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {notes
            .filter((note) => note.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
            .map((note) => (
              <button key={note.id} onClick={() => insert('note', note)}>
                {displayName(note.name)}
              </button>
            ))}
          {!notes.some((note) =>
            note.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          ) && <p>{t('mobile.noResults', { query })}</p>}
        </>
      ) : (
        <div className="mobile-insert-grid">
          {blocks.map(([action, label, sample]) => (
            <button key={action} onClick={() => insert(action)}>
              <span className="mobile-block-preview" aria-hidden="true">
                {sample}
              </span>
              <span>{t(label)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
