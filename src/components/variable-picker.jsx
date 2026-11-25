import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Modal } from './dialogs.jsx'
import { variableChoices } from '../variables.js'
import { t } from '../i18n.js'

const VALID_PROPERTY_KEY = /^[a-z][a-z0-9_.-]*$/

/** Picks a variable to insert: the note's own values first, then its properties, with a live preview. */
export function VariablePicker({ body, modifiedAt, createdAt, onPick, onCreateProperty, onClose }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const all = useMemo(
    () => variableChoices(body, { body, modifiedAt, createdAt }),
    [body, modifiedAt, createdAt],
  )
  const choices = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle
      ? all.filter((item) => `${item.label} ${item.insert}`.toLowerCase().includes(needle))
      : all
  }, [all, query])
  const candidateKey = useMemo(() => {
    if (!onCreateProperty) return null
    const raw = query.trim().toLowerCase().replace(/\s+/g, '_')
    if (!VALID_PROPERTY_KEY.test(raw)) return null
    if (all.some((item) => item.id === `user.${raw}`)) return null
    return raw
  }, [query, all, onCreateProperty])
  const current = choices[Math.min(selected, choices.length - 1)]
  const hasProperties = all.some((item) => item.group === 'user')
  const pickCreate = () => {
    if (!candidateKey || !onCreateProperty) return
    onCreateProperty(candidateKey, {
      id: `user.${candidateKey}`,
      group: 'user',
      label: candidateKey,
      insert: `{{user.${candidateKey}}}`,
      preview: '',
      select: null,
    })
  }
  return (
    <Modal
      label={t('variables.title')}
      className="template-picker variable-picker"
      backdropClose={onClose}
      onEscape={onClose}
      focusables={(dialog) => [...dialog.querySelectorAll('input, button')]}
    >
      <div className="palette-field">
        <Search size={16} aria-hidden="true" />
        <input
          autoFocus
          aria-label={t('variables.search')}
          placeholder={t('variables.search')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSelected((index) => Math.min(choices.length - 1, index + 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSelected((index) => Math.max(0, index - 1))
            }
            if (event.key === 'Enter') {
              if (current) onPick(current)
              else if (candidateKey) pickCreate()
            }
          }}
        />
      </div>
      <div
        className="results variable-picker-list"
        role="listbox"
        aria-label={t('variables.title')}
      >
        {choices.length ? (
          choices.map((item, index) => (
            <div key={item.id} role="presentation">
              {item.group !== choices[index - 1]?.group && (
                <small className="variable-picker-group">
                  {t(item.group === 'user' ? 'variables.groupUser' : 'variables.groupDocument')}
                </small>
              )}
              <button
                role="option"
                aria-selected={item === current}
                className={item === current ? 'selected' : ''}
                onClick={() => onPick(item)}
              >
                <span className="template-picker-item">
                  <strong>{item.label}</strong>
                  <small>{item.preview || item.insert}</small>
                </span>
              </button>
            </div>
          ))
        ) : !candidateKey ? (
          <p>{t('variables.none')}</p>
        ) : null}
        {candidateKey && (
          <button
            type="button"
            className={`variable-picker-create${!choices.length ? ' selected' : ''}`}
            onClick={pickCreate}
          >
            <Plus size={14} aria-hidden="true" />
            <span>{t('variables.createProperty', { name: candidateKey })}</span>
          </button>
        )}
      </div>
      {!hasProperties && <p className="variable-picker-hint">{t('variables.noProperties')}</p>}
      <button className="dialog-close" onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}
