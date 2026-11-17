import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Modal } from './dialogs.jsx'
import { variableChoices } from '../variables.js'
import { t } from '../i18n.js'

/** Picks a variable to insert: the note's own values first, then its properties, with a live preview. */
export function VariablePicker({ body, modifiedAt, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const all = useMemo(() => variableChoices(body, { body, modifiedAt }), [body, modifiedAt])
  const choices = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle
      ? all.filter((item) => `${item.label} ${item.insert}`.toLowerCase().includes(needle))
      : all
  }, [all, query])
  const current = choices[Math.min(selected, choices.length - 1)]
  const hasProperties = all.some((item) => item.group === 'user')
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
            if (event.key === 'Enter' && current) onPick(current)
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
        ) : (
          <p>{t('variables.none')}</p>
        )}
      </div>
      {!hasProperties && <p className="variable-picker-hint">{t('variables.noProperties')}</p>}
      <button className="dialog-close" onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}
