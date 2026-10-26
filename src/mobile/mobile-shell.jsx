import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  ListChecks,
  Monitor,
  Moon,
  MoreHorizontal,
  NotebookText,
  Pin,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { createAppPersistence } from '../persistence-runtime.js'
import { openWorkspace } from '../boot.js'
import { useNotesStore } from '../hooks/use-notes-store.js'
import { usePrefs } from '../hooks/use-prefs.js'
import { friendlyError } from '../errors.js'
import { protectPendingSaves } from '../save-lifecycle.js'
import { Markdown } from '../markdown.jsx'
import { VisualEditor } from '../visual-editor.jsx'
import { displayName, notePreview } from '../note-title.js'
import { noteSearchResult } from '../note-search.js'
import { findNote } from '../markdown-model.js'
import { moveToTrash, restoreFromTrash } from '../notes.js'
import { libraryImages } from '../images.js'
import { ImageThumbnail } from '../components/image-library.jsx'
import { TasksLibrary } from '../components/tasks-library.jsx'
import { ChangelogPanel } from '../components/changelog-panel.jsx'
import { toggleTask } from '../tasks.js'
import { t } from '../i18n.js'
import { useInsets } from './use-insets.js'
import { useNavigation } from './use-navigation.js'
import { newMobileNote, renameMobileNote, updateMobileNote } from './note-actions.js'
import { SwipeNoteRow } from './swipe-note-row.jsx'
import './mobile.css'

const destinations = [
  ['notes', NotebookText, 'menu.notes'],
  ['tasks', ListChecks, 'tasks.title'],
  ['images', ImageIcon, 'images.title'],
]

function ThemeControl({ theme, onChange }) {
  return (
    <div className="mobile-theme" role="group" aria-label={t('settings.theme')}>
      {[
        ['light', Sun],
        ['dark', Moon],
        ['system', Monitor],
      ].map(([value, Icon]) => (
        <button
          key={value}
          type="button"
          aria-label={t(`theme.${value}`)}
          aria-pressed={theme === value}
          title={t(`theme.${value}`)}
          onClick={() => onChange({ theme: value })}
        >
          <Icon size={18} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

export function MobileShell() {
  useInsets()
  const [started, setStarted] = useState(null)
  const [failure, setFailure] = useState(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    createAppPersistence()
      .then(async (persistence) => ({ persistence, loaded: await openWorkspace(persistence) }))
      .then((result) => {
        if (!cancelled) setStarted(result)
      })
      .catch((cause) => {
        if (!cancelled) setFailure(friendlyError(cause))
      })
    return () => {
      cancelled = true
    }
  }, [attempt])
  if (!started)
    return (
      <main className="mobile-shell" data-platform="mobile">
        <header className="mobile-header">
          <h1>Sloth Note</h1>
        </header>
        <div className="mobile-empty" role={failure ? 'alert' : 'status'}>
          <p>{failure ? t('app.openFailed', { failure }) : t('app.opening')}</p>
          {failure && (
            <button
              onClick={() => {
                setFailure(null)
                setAttempt(attempt + 1)
              }}
            >
              {t('mobile.retry')}
            </button>
          )}
        </div>
      </main>
    )
  return (
    <MobileWorkspace
      {...started}
      onReload={() => {
        setStarted(null)
        setAttempt(attempt + 1)
      }}
    />
  )
}

function MobileWorkspace({ persistence, loaded, onReload }) {
  const [rename, setRename] = useState(null)
  const [renameError, setRenameError] = useState('')
  const press = useRef(null)
  const suppressClick = useRef(false)
  function cancelPress() {
    clearTimeout(press.current?.timer)
    press.current = null
  }
  useEffect(() => () => clearTimeout(press.current?.timer), [])
  const [warning, setWarning] = useState('')
  const store = useNotesStore({ persistence, loaded, mode: 'visual', onHistoryWarning: setWarning })
  const { data, current, commit, writer, saving, error, blocked } = store
  const { prefs, updatePrefs } = usePrefs({ data, current, commit })
  const { state, dispatch } = useNavigation(current)
  const route = state.screens.at(-1)
  const layer = state.layers.at(-1)
  const active = route.name === 'note' ? data.notes.find((note) => note.id === route.id) : null
  const [editingId, setEditingId] = useState(null)
  const editing = active && editingId === active.id
  const [showDone, setShowDone] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const content = useRef(null)
  const editor = useRef(null)
  const focusAfterClose = useRef(null)
  const dialog = useRef(null)
  const hadLayer = useRef(false)
  const heading = useRef(null)
  const previousRoute = useRef(null)
  const restoreFocus = useRef(null)
  const back = () => {
    document.activeElement?.blur?.()
    dispatch({ type: 'back' })
  }
  const query = route.query ?? ''
  const recentSearches = Array.isArray(prefs.mobileRecentSearches)
    ? prefs.mobileRecentSearches.filter((term) => typeof term === 'string').slice(0, 5)
    : []
  const recentNotes = Array.isArray(prefs.mobileRecentNotes) ? prefs.mobileRecentNotes : []
  const root = state.screens.length === 1
  const actionsNote = layer?.id && data.notes.find((note) => note.id === layer.id)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === 'system' ? (media.matches ? 'dark' : 'light') : prefs.theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [prefs.theme])
  useEffect(() => {
    let cleanup,
      stopped = false
    protectPendingSaves(writer.current, false).then((fn) => {
      if (stopped) fn()
      else cleanup = fn
    })
    const flush = () => {
      void writer.current.whenIdle()
      void store.noteHistory.flush()
    }
    window.addEventListener('pagehide', flush)
    return () => {
      stopped = true
      cleanup?.()
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [writer, store.noteHistory])
  useLayoutEffect(() => {
    if (content.current) content.current.scrollTop = route.scroll ?? 0
    if (previousRoute.current?.name === 'note' && route.name !== 'note')
      restoreFocus.current = previousRoute.current.id
    previousRoute.current = route
    if (restoreFocus.current) {
      const id = restoreFocus.current
      restoreFocus.current = null
      const button = Array.from(content.current?.querySelectorAll('[data-note-id]') ?? []).find(
        (item) => item.dataset.noteId === id,
      )
      button?.focus({ preventScroll: true })
    } else if (route.name === 'note' && editing) editor.current?.focus()
    else heading.current?.focus({ preventScroll: true })
    // Only a screen change restores scroll; position updates must not fight the user's scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.name, route.id])
  useEffect(() => {
    if (!layer) {
      hadLayer.current = false
      focusAfterClose.current?.focus({ preventScroll: true })
      return
    }
    const previous = document.activeElement
    if (!hadLayer.current) focusAfterClose.current = previous
    hadLayer.current = true
    if (layer.name === 'dialog') dialog.current?.querySelector('input')?.focus()
    else if (
      hadLayer.current &&
      dialog.current?.querySelector('[data-rename-trigger]:not(:disabled)')
    )
      dialog.current.querySelector('[data-rename-trigger]:not(:disabled)').focus()
    else dialog.current?.querySelector('button')?.focus()
    const key = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dispatch({ type: 'back' })
        return
      }
      if (event.key !== 'Tab') return
      const items = Array.from(
        dialog.current?.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]',
        ) ?? [],
      )
      const first = items[0],
        last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
    // dispatch uses a ref-backed controller and is intentionally not an effect dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer])

  function openNote(id, edit = false) {
    document.activeElement?.blur?.()
    setEditingId(edit ? id : null)
    setSearchFocused(false)
    if (!blocked) {
      const old = current.current
      const searches = Array.isArray(old.preferences.mobileRecentSearches)
        ? old.preferences.mobileRecentSearches.filter((term) => typeof term === 'string')
        : []
      const visits = Array.isArray(old.preferences.mobileRecentNotes)
        ? old.preferences.mobileRecentNotes
        : []
      commit({
        ...old,
        openIds: old.openIds.includes(id) ? old.openIds : [...old.openIds, id],
        activeId: id,
        preferences: {
          ...old.preferences,
          mobileRecentNotes: [id, ...visits.filter((item) => item !== id)].slice(0, 300),
          mobileRecentSearches: query.trim()
            ? [query.trim(), ...searches.filter((term) => term !== query.trim())].slice(0, 5)
            : searches,
        },
      })
    }
    dispatch({ type: 'push', route: { name: 'note', id } })
  }
  function createNote(title = '') {
    if (blocked) return
    const next = newMobileNote(current.current, title)
    commit(next)
    openNote(next.activeId, true)
  }
  function updateBody(body) {
    if (!active || blocked) return
    commit(updateMobileNote(current.current, active.id, body))
    if (editor.current && editing)
      dispatch({ type: 'position', position: { cursor: editor.current.state.selection.main.head } })
  }
  function searchNotes(term) {
    if (content.current) content.current.scrollTop = 0
    dispatch({ type: 'position', position: { query: term, scroll: 0 } })
  }
  function openWiki(target) {
    const note = findNote(current.current.notes, target)
    if (note) openNote(note.id)
    else toast.info(t('mobile.missingNote', { name: target }))
  }
  function removeNote(id, closeSheet = true) {
    const before = current.current
    const index = before.notes.findIndex((note) => note.id === id)
    if (blocked || index < 0) return
    const wasPinned = before.pinnedIds?.includes(id)
    const next = moveToTrash(before, id, Date.now())
    commit(next)
    if (closeSheet) back()
    else {
      const focusId = next.notes[Math.min(index, next.notes.length - 1)]?.id
      requestAnimationFrame(() => {
        const target = Array.from(content.current?.querySelectorAll('[data-note-id]') ?? []).find(
          (item) => item.dataset.noteId === focusId,
        )
        ;(target ?? heading.current)?.focus({ preventScroll: true })
      })
    }
    toast(t('mobile.trashed'), {
      action: {
        label: t('mobile.undo'),
        onClick: () => {
          if (!current.current.trash.some((entry) => entry.note.id === id)) return
          const restored = restoreFromTrash(current.current, id)
          commit(
            wasPinned ? { ...restored, pinnedIds: [...(restored.pinnedIds ?? []), id] } : restored,
          )
        },
      },
    })
  }
  function pinNote(id) {
    const old = current.current
    const pinned = old.pinnedIds ?? []
    commit({
      ...old,
      openIds: old.openIds.includes(id) ? old.openIds : [...old.openIds, id],
      pinnedIds: pinned.includes(id) ? pinned.filter((item) => item !== id) : [...pinned, id],
    })
    back()
  }
  const results = data.notes
    .map((note, index) => ({ note, index, result: noteSearchResult(note, query) }))
    .filter(({ result }) => !query.trim() || result.titleMatches.length || result.matches.length)
    .sort((a, b) =>
      query.trim()
        ? Number(Boolean(b.result.titleMatches.length)) -
            Number(Boolean(a.result.titleMatches.length)) || a.index - b.index
        : Number(data.pinnedIds?.includes(b.note.id) ?? false) -
            Number(data.pinnedIds?.includes(a.note.id) ?? false) ||
          (recentNotes.includes(a.note.id) ? recentNotes.indexOf(a.note.id) : Infinity) -
            (recentNotes.includes(b.note.id) ? recentNotes.indexOf(b.note.id) : Infinity) ||
          a.index - b.index,
    )
  const title = active
    ? displayName(active.name)
    : route.name === 'note'
      ? t('mobile.noteGone')
      : t(
          {
            notes: 'menu.notes',
            tasks: 'tasks.title',
            images: 'images.title',
            settings: 'settings.changelog',
          }[route.name] ?? 'menu.notes',
        )
  const copy = (text) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast(t('mobile.copied')))
      .catch(() => toast.error(t('mobile.copyFailed')))
  if (blocked)
    return (
      <main className="mobile-shell" data-platform="mobile">
        <header className="mobile-header">
          <h1>Sloth Note</h1>
          <ThemeControl theme={prefs.theme} onChange={updatePrefs} />
        </header>
        <div className="mobile-empty" role="alert">
          <p>{t('mobile.readFailed')}</p>
          <p>{error}</p>
          <button onClick={onReload}>{t('mobile.retry')}</button>
        </div>
      </main>
    )
  return (
    <main
      className="mobile-shell"
      data-platform="mobile"
      style={{ '--editor-size': `${prefs.fontSize}px` }}
    >
      <header className="mobile-header">
        {!root && (
          <button
            className="mobile-icon"
            aria-label={t('mobile.back')}
            onClick={() => {
              if (active) restoreFocus.current = active.id
              back()
            }}
          >
            <ArrowLeft size={22} />
          </button>
        )}
        <h1 ref={heading} tabIndex={-1} title={title}>
          {root && route.name === 'notes' ? 'Sloth Note' : title}
        </h1>
        <ThemeControl theme={prefs.theme} onChange={updatePrefs} />
        {active && (
          <button
            className="mobile-edit"
            disabled={blocked}
            onClick={() => {
              if (editing) {
                editor.current?.contentDOM.blur()
                setEditingId(null)
              } else setEditingId(active.id)
            }}
          >
            {editing ? (
              <>
                <Check size={18} />
                {t('mobile.done')}
              </>
            ) : (
              t('mobile.edit')
            )}
          </button>
        )}
        {root && (
          <button
            className="mobile-icon"
            aria-label={t('mobile.more')}
            onClick={() => dispatch({ type: 'layer', route: { name: 'sheet' } })}
          >
            <MoreHorizontal size={22} />
          </button>
        )}
      </header>
      {(error || blocked || warning) && (
        <div className="mobile-error" role="alert">
          <p>
            {blocked ? t('mobile.readFailed') : t('mobile.saveFailed')} {error || warning}
          </p>
          <button onClick={() => (blocked ? onReload() : writer.current.write(current.current))}>
            {t('mobile.retry')}
          </button>
        </div>
      )}
      {root && route.name === 'notes' && (
        <label className="mobile-search">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            onFocus={() => setSearchFocused(true)}
            value={query}
            aria-label={t('mobile.search')}
            placeholder={t('mobile.search')}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event) => searchNotes(event.target.value)}
          />
        </label>
      )}
      {root && route.name === 'notes' && searchFocused && !query && recentSearches.length > 0 && (
        <div className="mobile-recent-searches" aria-label={t('mobile.recentSearches')}>
          {recentSearches.map((term) => (
            <button key={term} onClick={() => searchNotes(term)}>
              <Search size={14} aria-hidden="true" />
              {term}
            </button>
          ))}
        </div>
      )}
      <div
        className={`mobile-content${editing ? ' mobile-editing' : ''}`}
        ref={content}
        onScroll={(event) => {
          cancelPress()
          dispatch({ type: 'position', position: { scroll: event.currentTarget.scrollTop } })
        }}
      >
        {route.name === 'notes' && (
          <section aria-label={t('menu.notes')} className="mobile-notes">
            <h2>
              {query.trim() ? t('mobile.results') : t('menu.notes')} <span>{results.length}</span>
            </h2>
            {results.map(({ note, result }) => (
              <SwipeNoteRow
                key={note.id}
                enabled={!blocked && !layer}
                onTrash={() => removeNote(note.id, false)}
              >
                <div className="mobile-note-row">
                  <button
                    data-note-id={note.id}
                    className="mobile-note-open"
                    onPointerDown={(event) => {
                      if (!event.isPrimary || event.button !== 0) return
                      cancelPress()
                      suppressClick.current = false
                      const target = event.currentTarget
                      press.current = {
                        x: event.clientX,
                        y: event.clientY,
                        timer: setTimeout(() => {
                          suppressClick.current = true
                          target.focus({ preventScroll: true })
                          dispatch({ type: 'layer', route: { name: 'sheet', id: note.id } })
                        }, 550),
                      }
                    }}
                    onPointerMove={(event) => {
                      if (
                        press.current &&
                        Math.hypot(
                          event.clientX - press.current.x,
                          event.clientY - press.current.y,
                        ) > 10
                      )
                        cancelPress()
                    }}
                    onPointerUp={cancelPress}
                    onPointerCancel={cancelPress}
                    onContextMenu={(event) => event.preventDefault()}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false
                        return
                      }
                      openNote(note.id)
                    }}
                  >
                    <span className="mobile-note-title">
                      {data.pinnedIds?.includes(note.id) && (
                        <Pin size={14} aria-label={t('mobile.pinned')} />
                      )}
                      {displayName(note.name)}
                    </span>
                    <span className="mobile-note-preview">
                      {result.snippet ? (
                        <>
                          {result.snippet.before}
                          <mark>{result.snippet.hit}</mark>
                          {result.snippet.after}
                        </>
                      ) : (
                        notePreview(note.body) || t('mobile.emptyNote')
                      )}
                    </span>
                  </button>
                  <button
                    className="mobile-icon"
                    aria-label={t('mobile.noteActions', { name: displayName(note.name) })}
                    onClick={() =>
                      dispatch({ type: 'layer', route: { name: 'sheet', id: note.id } })
                    }
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
              </SwipeNoteRow>
            ))}
            {!results.length && (
              <div className="mobile-empty">
                <NotebookText size={32} aria-hidden="true" />
                <p>{query.trim() ? t('mobile.noResults', { query }) : t('mobile.noNotes')}</p>
                <button disabled={blocked} onClick={() => createNote(query.trim())}>
                  {query.trim()
                    ? t('mobile.createNamed', { name: query.trim() })
                    : t('menu.newNote')}
                </button>
              </div>
            )}
          </section>
        )}
        {route.name === 'note' &&
          (active ? (
            editing ? (
              <VisualEditor
                key={active.id}
                noteId={active.id}
                notes={data.notes}
                body={active.body}
                onChange={updateBody}
                onOpenWiki={openWiki}
                onCopy={copy}
                onSelectionChange={(selection) =>
                  dispatch({ type: 'position', position: { cursor: selection.head } })
                }
                onReady={(view) => {
                  editor.current = view
                  if (view) {
                    const cursor = Math.min(view.state.doc.length, Math.max(2, route.cursor ?? 2))
                    view.dispatch({ selection: { anchor: cursor }, scrollIntoView: true })
                    view.focus()
                  }
                }}
              />
            ) : (
              <Markdown
                text={active.body}
                notes={data.notes}
                onChange={blocked ? undefined : updateBody}
                onOpenWiki={openWiki}
                onCopy={copy}
              />
            )
          ) : (
            <div className="mobile-empty">
              <p>{t('mobile.noteGone')}</p>
              <button onClick={back}>{t('mobile.back')}</button>
            </div>
          ))}
        {route.name === 'tasks' && (
          <TasksLibrary
            notes={data.notes}
            query=""
            showDone={showDone}
            onShowDone={setShowDone}
            onJump={(id) => openNote(id)}
            onToggle={(id, mark) => {
              if (!blocked) {
                const note = current.current.notes.find((item) => item.id === id)
                if (note)
                  commit(
                    updateMobileNote(current.current, id, toggleTask(note.body, mark)),
                    'tarefa',
                  )
              }
            }}
          />
        )}
        {route.name === 'images' && (
          <section className="mobile-images" aria-label={t('images.title')}>
            {libraryImages(data).map((image) => (
              <figure key={image.src}>
                <ImageThumbnail src={image.src} alt={image.name} />
                <figcaption>
                  {image.name}
                  {image.noteIds.map((id) => {
                    const note = data.notes.find((item) => item.id === id)
                    return (
                      note && (
                        <button key={id} onClick={() => openNote(id)}>
                          {displayName(note.name)}
                        </button>
                      )
                    )
                  })}
                </figcaption>
              </figure>
            ))}
            {!libraryImages(data).length && (
              <div className="mobile-empty">
                <ImageIcon size={32} aria-hidden="true" />
                <p>{t('mobile.noImages')}</p>
              </div>
            )}
          </section>
        )}
        {route.name === 'settings' && <ChangelogPanel />}
      </div>
      {root && route.name === 'notes' && (
        <div className="mobile-create">
          <button
            className="mobile-fab"
            disabled={blocked}
            aria-label={t('menu.newNote')}
            onClick={() => createNote()}
          >
            <Plus size={26} />
            {t('menu.newNote')}
          </button>
        </div>
      )}
      {root && (
        <nav className="mobile-bottom" aria-label={t('mobile.navigation')}>
          {destinations.map(([name, Icon, label]) => (
            <button
              key={name}
              aria-current={route.name === name ? 'page' : undefined}
              onClick={() => {
                document.activeElement?.blur?.()
                dispatch({ type: 'tab', name })
              }}
            >
              <Icon size={22} aria-hidden="true" />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
      )}
      {active && (
        <footer className="mobile-save" role="status">
          {error || blocked ? t('mobile.notSaved') : saving ? t('save.saving') : t('mobile.saved')}
        </footer>
      )}
      {layer && (
        <div
          className="mobile-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) back()
          }}
        >
          <section
            ref={dialog}
            className="mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={
              actionsNote
                ? t('mobile.noteActions', { name: displayName(actionsNote.name) })
                : t('mobile.more')
            }
          >
            <div className="mobile-sheet-heading">
              <details className="mobile-sheet-title">
                <summary>
                  <h2>{actionsNote ? displayName(actionsNote.name) : 'Sloth Note'}</h2>
                </summary>
              </details>
              <button className="mobile-icon" aria-label={t('dialog.close')} onClick={back}>
                <X size={22} />
              </button>
            </div>
            {layer.name === 'dialog' ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  const result = renameMobileNote(current.current, layer.id, rename ?? '')
                  if (result.error) {
                    setRenameError(t(result.error))
                    return
                  }
                  commit(result.document)
                  back()
                }}
              >
                <label htmlFor="mobile-rename">{t('dialog.renameLabel')}</label>
                <input
                  id="mobile-rename"
                  value={rename ?? ''}
                  onChange={(event) => {
                    setRename(event.target.value)
                    setRenameError('')
                  }}
                  aria-invalid={Boolean(renameError)}
                  aria-describedby={renameError ? 'mobile-rename-error' : undefined}
                />
                {renameError && (
                  <p id="mobile-rename-error" role="alert">
                    {renameError}
                  </p>
                )}
                <button type="button" onClick={back}>
                  {t('dialog.cancel')}
                </button>
                <button type="submit" disabled={blocked}>
                  {t('menu.rename')}
                </button>
              </form>
            ) : actionsNote ? (
              <>
                <button
                  data-rename-trigger
                  disabled={blocked || Boolean(actionsNote.external)}
                  onClick={() => {
                    setRename(displayName(actionsNote.name))
                    setRenameError('')
                    dispatch({ type: 'layer', route: { name: 'dialog', id: actionsNote.id } })
                  }}
                >
                  {t('menu.rename')}
                </button>
                <button disabled={blocked} onClick={() => pinNote(actionsNote.id)}>
                  <Pin size={20} />
                  {t(data.pinnedIds?.includes(actionsNote.id) ? 'mobile.unpin' : 'mobile.pin')}
                </button>
                <button
                  className="danger"
                  disabled={blocked}
                  onClick={() => removeNote(actionsNote.id)}
                >
                  <Trash2 size={20} />
                  {t('mobile.trash')}
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  dispatch({ type: 'push', route: { name: 'settings' } })
                }}
              >
                <NotebookText size={20} />
                {t('settings.changelog')}
              </button>
            )}
          </section>
        </div>
      )}
      <Toaster
        theme={prefs.theme}
        position="top-center"
        closeButton
        toastOptions={{
          classNames: { toast: 'app-toast' },
          closeButtonAriaLabel: t('dialog.close'),
        }}
      />
    </main>
  )
}
