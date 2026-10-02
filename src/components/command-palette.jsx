import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Modal } from './dialogs.jsx'
import { Shortcut } from './main-menu.jsx'
import { t } from '../i18n.js'

/** Ctrl+K: every action in one searchable list. Disabled actions are hidden. */
export function CommandPalette({ commands, onRun, onClose }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const list = useRef(null)
  const needle = query.toLocaleLowerCase()
  const matches = commands.filter(
    (command) => !command.disabled && command.label.toLocaleLowerCase().includes(needle),
  )
  const index = Math.min(selected, Math.max(0, matches.length - 1))
  useEffect(() => {
    list.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })
  }, [index, query])
  return (
    <Modal
      label={t('menu.commands')}
      backdropClose={onClose}
      onEscape={onClose}
      focusables={(dialog) => [dialog.querySelector('input')]}
    >
      <div className="palette-field">
        <Search size={16} aria-hidden="true" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          aria-activedescendant={matches[index] ? `command-${matches[index].id}` : undefined}
          aria-label={t('menu.commands')}
          placeholder={t('commands.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSelected(Math.min(matches.length - 1, index + 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSelected(Math.max(0, index - 1))
            }
            if (event.key === 'Enter' && matches[index]) {
              // Without this the Enter keypress would click whatever the action focuses next.
              event.preventDefault()
              onRun(matches[index].id)
            }
          }}
        />
      </div>
      <div className="results" id="command-results" role="listbox" ref={list}>
        {matches.length ? (
          matches.map((command, position) => (
            <div
              key={command.id}
              id={`command-${command.id}`}
              role="option"
              aria-selected={position === index}
              className={`command-row${position === index ? ' selected' : ''}`}
              onMouseMove={() => setSelected(position)}
              onClick={() => onRun(command.id)}
            >
              <command.Icon size={15} aria-hidden="true" />
              <span>{command.label}</span>
              {command.keys && <Shortcut keys={command.keys} />}
            </div>
          ))
        ) : (
          <p>{t('commands.none')}</p>
        )}
      </div>
    </Modal>
  )
}
