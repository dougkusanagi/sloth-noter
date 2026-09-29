// Modal dialogs of the workspace. State lives in the parent; these only render and handle keys.
import { useEffect, useRef } from 'react'
import { t } from '../i18n.js'

function trapTab(event, focusable) {
  if (event.key !== 'Tab' || focusable.length === 0) return
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const buttonsOf = (dialog, selector = 'button') => [...dialog.querySelectorAll(selector)]

/** Backdrop plus dialog section with Tab kept inside; `focusables` lists the tab stops. */
function Modal({
  label,
  className = '',
  backdropClose,
  onEscape,
  onKeyDown,
  focusables = buttonsOf,
  children,
}) {
  return (
    <div className="palette-backdrop" onMouseDown={backdropClose}>
      <section
        className={`palette ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={backdropClose ? (event) => event.stopPropagation() : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && onEscape) {
            event.stopPropagation()
            onEscape()
          }
          onKeyDown?.(event)
          trapTab(event, focusables(event.currentTarget))
        }}
      >
        {children}
      </section>
    </div>
  )
}

export function PaletteDialog({
  inputRef,
  query,
  choices,
  selected,
  onQuery,
  onSelect,
  onOpen,
  onClose,
}) {
  return (
    <Modal
      label={t('palette.label')}
      backdropClose={onClose}
      focusables={(dialog) => [inputRef.current, ...buttonsOf(dialog)]}
    >
      <input
        ref={inputRef}
        aria-label={t('palette.search')}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            onSelect((index) => Math.min(choices.length - 1, index + 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            onSelect((index) => Math.max(0, index - 1))
          }
          if (event.key === 'Enter' && choices[selected]) onOpen(choices[selected].id)
        }}
        placeholder={t('palette.placeholder')}
      />
      <div className="results">
        {choices.length ? (
          choices.map((note, index) => (
            <button
              key={note.id}
              className={index === selected ? 'selected' : ''}
              aria-current={index === selected ? 'true' : undefined}
              onClick={() => onOpen(note.id)}
            >
              {note.name}
            </button>
          ))
        ) : (
          <p>{t('palette.none')}</p>
        )}
      </div>
      <button className="dialog-close" onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}

export function ConflictDialog({ firstRef, name, onResolve, onClose }) {
  return (
    <Modal label={t('conflict.label')} className="conflict" onEscape={onClose}>
      <p>{t('conflict.text', { name })}</p>
      <button ref={firstRef} onClick={() => onResolve(false)}>
        {t('conflict.keepBoth')}
      </button>
      <button onClick={() => onResolve(true)}>{t('conflict.replace')}</button>
      <button onClick={onClose}>{t('dialog.cancel')}</button>
    </Modal>
  )
}

export function TrashDialog({ firstRef, trash, onRestore, onPurge, onClose }) {
  return (
    <Modal label={t('trash.title')} className="trash-dialog">
      <h2>{t('trash.title')}</h2>
      {trash.length ? (
        <div className="trash-list">
          {trash.map((entry) => (
            <div className="trash-item" key={entry.note.id}>
              <span>{entry.note.name}</span>
              <button onClick={() => onRestore(entry.note.id)}>{t('trash.restore')}</button>
              <button onClick={() => onPurge(entry.note.id)}>{t('trash.purge')}</button>
            </div>
          ))}
        </div>
      ) : (
        <p>{t('trash.empty')}</p>
      )}
      <button ref={firstRef} onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}

export function FindDialog({ inputRef, query, matchCount, onQuery, onStep, onClose }) {
  return (
    <Modal
      label={t('find.label')}
      className="find-dialog"
      backdropClose={onClose}
      onEscape={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onStep(event.shiftKey ? -1 : 1)
        }
      }}
      focusables={(dialog) => [inputRef.current, ...buttonsOf(dialog, 'button:not(:disabled)')]}
    >
      <input
        ref={inputRef}
        aria-label={t('find.input')}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={t('find.placeholder')}
      />
      <p role="status">{query ? t('find.matches', { count: matchCount }) : t('find.hint')}</p>
      <button disabled={!matchCount} onClick={() => onStep(-1)}>
        {t('find.previous')}
      </button>
      <button disabled={!matchCount} onClick={() => onStep(1)}>
        {t('find.next')}
      </button>
      <button className="dialog-close" onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}

/** In-app replacement for window.confirm/alert, which webviews do not reliably provide. */
export function ConfirmDialog({ message, confirmLabel, cancelLabel, single, onAnswer }) {
  return (
    <Modal label={message} className="conflict" onEscape={() => onAnswer(false)}>
      <p>{message}</p>
      <button autoFocus onClick={() => onAnswer(true)}>
        {confirmLabel ?? t('dialog.ok')}
      </button>
      {!single && (
        <button onClick={() => onAnswer(false)}>{cancelLabel ?? t('dialog.cancel')}</button>
      )}
    </Modal>
  )
}

/** In-app replacement for window.prompt, which Tauri webviews do not support. */
export function PromptDialog({ label, initial, onAnswer }) {
  const input = useRef(null)
  useEffect(() => {
    input.current?.select()
  }, [])
  return (
    <Modal
      label={label}
      className="conflict prompt-dialog"
      onEscape={() => onAnswer(null)}
      focusables={(dialog) => [input.current, ...buttonsOf(dialog)]}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onAnswer(input.current.value)
        }}
      >
        <label>
          {label}
          <input ref={input} autoFocus defaultValue={initial} />
        </label>
        <button type="submit">{t('dialog.ok')}</button>
        <button type="button" onClick={() => onAnswer(null)}>
          {t('dialog.cancel')}
        </button>
      </form>
    </Modal>
  )
}

/** A note edited here was also changed or deleted on disk; the user decides what survives. */
export function SyncConflictDialog({ conflict, onResolve }) {
  const deleted = conflict.kind === 'deleted'
  return (
    <Modal label={t('sync.title')} className="conflict">
      <h2>{t('sync.title')}</h2>
      <p>{t(deleted ? 'sync.deleted' : 'sync.changed', { name: conflict.name })}</p>
      <button autoFocus onClick={() => onResolve('mine')}>
        {t('sync.keepMine')}
      </button>
      <button onClick={() => onResolve('external')}>
        {t(deleted ? 'sync.useExternalDeleted' : 'sync.useExternal')}
      </button>
      {!deleted && <button onClick={() => onResolve('both')}>{t('sync.keepBoth')}</button>}
    </Modal>
  )
}

export function FolderDialog({ path, onChoose, onUseAppStorage, onClose }) {
  return (
    <Modal
      label={t('folder.title')}
      className="conflict"
      backdropClose={onClose}
      onEscape={onClose}
    >
      <h2>{t('folder.title')}</h2>
      <p>{path ? t('folder.current', { path }) : t('folder.appStorage')}</p>
      <p className="dialog-hint">{t('folder.hint')}</p>
      <button autoFocus onClick={onChoose}>
        {t(path ? 'folder.change' : 'folder.choose')}
      </button>
      {path && <button onClick={onUseAppStorage}>{t('folder.useAppStorage')}</button>}
      <button className="dialog-close" onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}
