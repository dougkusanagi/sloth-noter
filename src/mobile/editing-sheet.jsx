import { MOBILE_INSERT_BLOCKS as blocks } from '../block-catalog.js'
import { useState } from 'react'
import { redo } from '@codemirror/commands'
import { blockEdit } from '../insert-block.js'
import { shortcutEdit } from '../editor-shortcuts.js'
import { t } from '../i18n.js'
import { displayName } from '../note-title.js'
import { currentLanguage } from '../i18n.js'
import { templateInsertEdit, templateList } from '../templates.js'
import { variableChoices, variableInsertEdit } from '../variables.js'
import { writeProperty } from '../frontmatter.js'

const VALID_PROPERTY_KEY = /^[a-z][a-z0-9_.-]*$/

export function EditingSheet({ view, notes, modifiedAt, createdAt, onClose, onImage }) {
  const [linking, setLinking] = useState(false)
  const [choosingTemplate, setChoosingTemplate] = useState(false)
  const [choosingVariable, setChoosingVariable] = useState(false)
  const [choosingTable, setChoosingTable] = useState(false)
  const [query, setQuery] = useState('')
  function insertTable(rows, cols) {
    if (!view || view.composing || view.compositionStarted) return
    const { from, to } = view.state.selection.main
    const text = view.state.doc.toString()
    const before =
      from === 0 || text.slice(0, from).endsWith('\n\n')
        ? ''
        : text.slice(0, from).endsWith('\n')
          ? '\n'
          : '\n\n'
    const header = `| ${Array.from({ length: cols }, (_, i) => `Coluna ${i + 1}`).join(' | ')} |`
    const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`
    const body = Array.from(
      { length: rows },
      (_, r) =>
        `| ${Array.from({ length: cols }, (_, c) => `Valor ${r + 1}.${c + 1}`).join(' | ')} |`,
    ).join('\n')
    const insert = `${before}${header}\n${sep}\n${body}\n`
    const start = from + before.length
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: start + 2, head: start + 10 },
      userEvent: 'input',
      scrollIntoView: true,
    })
    onClose()
    view.focus()
  }
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
    if (action === 'template' && !note) {
      setChoosingTemplate(true)
      return
    }
    if (action === 'variable' && !note) {
      setQuery('')
      setChoosingVariable(true)
      return
    }
    if (action === 'table') {
      setChoosingTable(true)
      return
    }
    const { from, to } = view.state.selection.main
    const text = view.state.doc.toString()
    const edit =
      action === 'template'
        ? templateInsertEdit(text, from, to, note, currentLanguage())
        : note
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
  function insertVariable(choice, createKey) {
    if (!view || view.composing || view.compositionStarted) return
    const { from, to } = view.state.selection.main
    const doc = view.state.doc.toString()
    if (createKey) {
      const withProp = writeProperty(doc, createKey, '')
      if (withProp === null) return
      const delta = withProp.length - doc.length
      const edit = variableInsertEdit(from + delta, to + delta, choice)
      const next = withProp.slice(0, edit.from) + edit.insert + withProp.slice(edit.to)
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: next },
        selection: { anchor: edit.selectionFrom, head: edit.selectionTo },
        userEvent: 'input',
        scrollIntoView: true,
      })
    } else {
      const edit = variableInsertEdit(from, to, choice)
      view.dispatch({
        changes: { from: edit.from, to: edit.to, insert: edit.insert },
        selection: { anchor: edit.selectionFrom, head: edit.selectionTo },
        userEvent: 'input',
        scrollIntoView: true,
      })
    }
    onClose()
    view.focus()
  }
  const variableText = choosingVariable ? (view?.state.doc.toString() ?? '') : ''
  const allVariables = choosingVariable
    ? variableChoices(variableText, { body: variableText, modifiedAt, createdAt })
    : []
  const filteredVariables = choosingVariable
    ? query.trim()
      ? allVariables.filter((item) =>
          `${item.label} ${item.insert}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : allVariables
    : []
  const candidatePropertyKey = (() => {
    if (!choosingVariable) return null
    const raw = query.trim().toLowerCase().replace(/\s+/g, '_')
    if (!VALID_PROPERTY_KEY.test(raw)) return null
    if (allVariables.some((item) => item.id === `user.${raw}`)) return null
    return raw
  })()
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
      {choosingTable ? (
        <div className="mobile-table-picker">
          <p className="mobile-table-picker-title">{t('mobile.tableGridTitle')}</p>
          <div className="mobile-table-grid">
            {[2, 3, 4, 5, 6].map((rows) =>
              [2, 3, 4, 5, 6].map((cols) => (
                <button
                  key={`${rows}x${cols}`}
                  type="button"
                  onClick={() => insertTable(rows, cols)}
                >
                  {rows} × {cols}
                </button>
              )),
            )}
          </div>
        </div>
      ) : choosingVariable ? (
        <div className="mobile-insert-grid mobile-template-list">
          <label>
            {t('variables.title')}
            <input
              autoFocus
              type="search"
              placeholder={t('variables.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {filteredVariables.map((item) => (
            <button key={item.id} onClick={() => insertVariable(item)}>
              <strong>{item.label}</strong>
              <span>{item.preview || item.insert}</span>
            </button>
          ))}
          {candidatePropertyKey && (
            <button
              onClick={() =>
                insertVariable(
                  {
                    id: `user.${candidatePropertyKey}`,
                    group: 'user',
                    label: candidatePropertyKey,
                    insert: `{{user.${candidatePropertyKey}}}`,
                    preview: '',
                    select: null,
                  },
                  candidatePropertyKey,
                )
              }
            >
              <strong>{t('variables.createProperty', { name: candidatePropertyKey })}</strong>
              <span>{`{{user.${candidatePropertyKey}}}`}</span>
            </button>
          )}
          {!filteredVariables.length && !candidatePropertyKey && <p>{t('variables.none')}</p>}
        </div>
      ) : choosingTemplate ? (
        <div className="mobile-insert-grid mobile-template-list">
          {templateList(currentLanguage()).map((item) => (
            <button key={item.id} onClick={() => insert('template', item.id)}>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
      ) : linking ? (
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
