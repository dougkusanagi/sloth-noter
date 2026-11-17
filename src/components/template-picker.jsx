import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Modal } from './dialogs.jsx'
import { Markdown } from '../markdown.jsx'
import { renderTemplate, templateList } from '../templates.js'
import { t } from '../i18n.js'

/** Picks a built-in template: a searchable list with a rendered preview of the chosen one. */
export function TemplatePicker({ language, insert = false, onPick, onClose }) {
  const input = useRef(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const all = useMemo(() => templateList(language), [language])
  const choices = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle
      ? all.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(needle))
      : all
  }, [all, query])
  const current = choices[Math.min(selected, choices.length - 1)]
  const preview = useMemo(
    () => (current ? renderTemplate(current.body, { language }).text : ''),
    [current, language],
  )
  return (
    <Modal
      label={t('templates.title')}
      className="template-picker"
      backdropClose={onClose}
      onEscape={onClose}
      focusables={(dialog) => [...dialog.querySelectorAll('input, button')]}
    >
      <div className="palette-field">
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          autoFocus
          aria-label={t('templates.search')}
          placeholder={t('templates.search')}
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
            if (event.key === 'Enter' && current) onPick(current.id)
          }}
        />
      </div>
      <div className="template-picker-body">
        <div className="results" role="listbox" aria-label={t('templates.title')}>
          {choices.length ? (
            choices.map((item) => (
              <button
                key={item.id}
                role="option"
                aria-selected={item === current}
                className={item === current ? 'selected' : ''}
                onClick={() => setSelected(choices.indexOf(item))}
                onDoubleClick={() => onPick(item.id)}
              >
                <span className="template-picker-item">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            ))
          ) : (
            <p>{t('templates.none')}</p>
          )}
        </div>
        {current && (
          <div className="template-picker-preview" aria-label={t('templates.preview')}>
            <Markdown text={preview} />
          </div>
        )}
      </div>
      <button
        className="dialog-close"
        disabled={!current}
        onClick={() => current && onPick(current.id)}
      >
        {t(insert ? 'templates.insert' : 'templates.use')}
      </button>
      <button className="dialog-close" onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}
