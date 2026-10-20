import { SHORTCUTS } from '../shortcuts.js'
import { Shortcut, shortcutText } from './main-menu.jsx'
// Modal dialogs of the workspace. State lives in the parent; these only render and handle keys.
import { useEffect, useRef, useState } from 'react'
import {
  Search,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  X,
  CaseSensitive,
  WholeWord,
  Regex,
  Replace,
  ReplaceAll,
  CaseUpper,
  TextSelect,
} from 'lucide-react'
import { displayName } from '../note-title.js'
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
export function Modal({
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
      <div className="palette-field">
        <Search size={16} aria-hidden="true" />
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
      </div>
      <div className="results">
        {choices.length ? (
          choices.map((note, index) => (
            <button
              key={note.id}
              className={index === selected ? 'selected' : ''}
              aria-current={index === selected ? 'true' : undefined}
              onClick={() => onOpen(note.id)}
            >
              {displayName(note.name)}
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

export function FindDialog({
  inputRef,
  replacementRef,
  query,
  matchCount,
  index,
  error,
  options,
  onOptions,
  replaceOpen,
  onToggleReplace,
  replacement,
  onReplacement,
  onReplace,
  onQuery,
  onStep,
  onClose,
}) {
  const toggle = (key, Icon) => (
    <button
      type="button"
      className="find-toggle"
      aria-label={t(`find.${key}`)}
      title={t(`find.${key}`)}
      aria-pressed={options[key]}
      onClick={() => onOptions(key)}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  )
  return (
    <section
      className="find-dialog"
      role="dialog"
      aria-label={t('find.label')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
          event.preventDefault()
          if (event.target === inputRef.current) onStep(event.shiftKey ? -1 : 1)
          else onReplace(event.ctrlKey || event.metaKey)
        }
        if (event.altKey) {
          const key = { c: 'caseSensitive', w: 'wholeWord', r: 'regex', p: 'preserveCase' }[
            event.key.toLowerCase()
          ]
          if (key) {
            event.preventDefault()
            onOptions(key)
          }
        }
      }}
    >
      <button
        type="button"
        className="find-expand"
        aria-label={t('find.toggleReplace')}
        title={t('find.toggleReplace')}
        aria-expanded={replaceOpen}
        onClick={onToggleReplace}
      >
        {replaceOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <div className="find-fields">
        <div className="find-row">
          <div className="find-input-wrap" data-invalid={error ? '' : undefined}>
            <input
              ref={inputRef}
              aria-label={t('find.input')}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'find-error' : undefined}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder={t('find.placeholder')}
            />
            {toggle('caseSensitive', CaseSensitive)}
            {toggle('wholeWord', WholeWord)}
            {toggle('regex', Regex)}
          </div>
          <span
            className="find-count"
            role="status"
            aria-label={query ? t('find.matches', { count: matchCount }) : t('find.hint')}
          >
            {query
              ? matchCount
                ? `${index + 1} / ${matchCount}`
                : t('find.none')
              : t('find.hint')}
          </span>
          <button
            type="button"
            aria-label={t('find.previous')}
            title={`${t('find.previous')} (Shift+Enter)`}
            disabled={!matchCount}
            onClick={() => onStep(-1)}
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            aria-label={t('find.next')}
            title={`${t('find.next')} (Enter)`}
            disabled={!matchCount}
            onClick={() => onStep(1)}
          >
            <ArrowDown size={16} />
          </button>
          <button
            type="button"
            aria-label={t('find.selectionOnly')}
            title={t('find.selectionOnly')}
            aria-pressed={options.selectionOnly}
            disabled={!options.scope}
            onClick={() => onOptions('selectionOnly')}
          >
            <TextSelect size={16} />
          </button>
          <button
            type="button"
            aria-label={t('dialog.close')}
            title={t('dialog.close')}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        {replaceOpen && (
          <div className="find-row">
            <div className="find-input-wrap">
              <input
                ref={replacementRef}
                aria-label={t('find.replacement')}
                placeholder={t('find.replacement')}
                value={replacement}
                onChange={(event) => onReplacement(event.target.value)}
              />
              {toggle('preserveCase', CaseUpper)}
            </div>
            <button
              type="button"
              aria-label={t('find.replace')}
              title={`${t('find.replace')} (Enter)`}
              disabled={!matchCount}
              onClick={() => onReplace(false)}
            >
              <Replace size={16} />
            </button>
            <button
              type="button"
              aria-label={t('find.replaceAll')}
              title={`${t('find.replaceAll')} (Ctrl+Enter)`}
              disabled={!matchCount}
              onClick={() => onReplace(true)}
            >
              <ReplaceAll size={16} />
            </button>
          </div>
        )}
        {error && (
          <p id="find-error" role="alert">
            {t('find.regexError')}
          </p>
        )}
      </div>
    </section>
  )
}

/** In-app replacement for window.confirm/alert, which webviews do not reliably provide. */
export function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  dismissLabel,
  single,
  onAnswer,
}) {
  return (
    <Modal
      label={message}
      className="conflict"
      onEscape={() => onAnswer(dismissLabel ? null : false)}
    >
      <p>{message}</p>
      <button autoFocus onClick={() => onAnswer(true)}>
        {confirmLabel ?? t('dialog.ok')}
      </button>
      {!single && (
        <button onClick={() => onAnswer(false)}>{cancelLabel ?? t('dialog.cancel')}</button>
      )}
      {dismissLabel && <button onClick={() => onAnswer(null)}>{dismissLabel}</button>}
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

export function ShortcutList() {
  const [query, setQuery] = useState('')
  const squash = (text) => text.toLocaleLowerCase().replace(/[\s+]/g, '')
  const needle = squash(query)
  const shown = SHORTCUTS.filter(
    ([keys, label]) => !needle || squash(`${t(label)} ${shortcutText(keys)}`).includes(needle),
  )
  return (
    <div className="shortcuts">
      <div className="search-field">
        <Search size={14} aria-hidden="true" />
        <input
          aria-label={t('shortcuts.search')}
          placeholder={t('shortcuts.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="shortcut-list" role="list" tabIndex={0} aria-label={t('menu.shortcuts')}>
        {shown.map(([keys, label]) => (
          <div key={keys} role="listitem">
            <span>{t(label)}</span>
            <Shortcut keys={keys} />
          </div>
        ))}
        {!shown.length && <p className="sidebar-empty">{t('library.noResults')}</p>}
      </div>
    </div>
  )
}

export function ShortcutsDialog({ onClose }) {
  return (
    <Modal
      label={t('menu.shortcuts')}
      className="shortcuts-dialog"
      focusables={(dialog) => [...dialog.querySelectorAll('input, button')]}
      backdropClose={onClose}
      onEscape={onClose}
    >
      <h2>{t('menu.shortcuts')}</h2>
      <ShortcutList />
      <button autoFocus className="dialog-close" onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}
