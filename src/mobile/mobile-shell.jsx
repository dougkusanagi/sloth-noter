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
  Pencil,
  Plus,
  Search,
  Share2,
  Sun,
  Trash2,
  Settings,
  FileText,
  Copy,
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
import { BackupPanel } from './backup-panel.jsx'
import { ReadingFind } from './reading-find.jsx'
import { FONT_SIZE } from '../storage.js'
import { moveToTrash, purgeFromTrash, restoreFromTrash } from '../notes.js'
import { importImage, libraryImages, markdownImage } from '../images.js'
import { ImageThumbnail } from '../components/image-library.jsx'
import { TasksLibrary } from '../components/tasks-library.jsx'
import { ChangelogPanel } from '../components/changelog-panel.jsx'
import { toggleTask } from '../tasks.js'
import { t } from '../i18n.js'
import { useInsets } from './use-insets.js'
import { useSystemBars } from './use-system-bars.js'
import { useNativeActions } from './use-native-actions.js'
import { canShare, canShareFile, shareFile, shareText } from './share.js'
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

const SHARED_TEXT_LIMIT = 1_000_000

export function MobileShell() {
  useInsets()
  useSystemBars()
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
  const { prefs, updatePrefs: savePrefs } = usePrefs({ data, current, commit })
  function updatePrefs(change) {
    savePrefs('wrapLines' in change ? { ...change, wrapLinesByNote: {} } : change)
  }
  const { state, dispatch } = useNavigation(current)
  const route = state.screens.at(-1)
  const layer = state.layers.at(-1)
  const active = route.name === 'note' ? data.notes.find((note) => note.id === route.id) : null
  const pageWrap =
    active && Object.hasOwn(prefs.wrapLinesByNote ?? {}, active.id)
      ? prefs.wrapLinesByNote[active.id]
      : prefs.wrapLines !== false
  const [editingId, setEditingId] = useState(null)
  const editing = active && editingId === active.id
  const [showDone, setShowDone] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
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
  function receiveSharedText(text) {
    const clean = text.replaceAll('\r\n', '\n').trim()
    if (!clean) return
    if (clean.length > SHARED_TEXT_LIMIT) {
      toast.error(t('mobile.sharedTooLarge'))
      return
    }
    const title = t('mobile.sharedTitle')
    const created = newMobileNote(current.current, title)
    const next = updateMobileNote(created, created.activeId, `# ${title}\n\n${clean}`)
    commit(next)
    openNote(created.activeId, false)
    toast(t('mobile.sharedSaved'))
  }
  useNativeActions({ newNote: () => createNote(), sharedText: receiveSharedText }, !blocked)
  function updateBody(body) {
    if (!active || blocked) return
    commit(updateMobileNote(current.current, active.id, body))
    if (editor.current && editing)
      dispatch({ type: 'position', position: { cursor: editor.current.state.selection.main.head } })
  }
  function insertImageMarkdown(text, point, noteId) {
    const note = current.current.notes.find((item) => item.id === noteId)
    if (!note) return point
    const from = Math.min(Math.max(2, point.from), note.body.length)
    const to = Math.min(Math.max(from, point.to), note.body.length)
    const insert = `${from && note.body[from - 1] !== '\n' ? '\n' : ''}${text}\n`
    const view = editor.current
    if (view?.dom.isConnected && current.current.activeId === noteId) {
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        userEvent: 'input.paste',
        scrollIntoView: true,
      })
    } else {
      commit(
        updateMobileNote(
          current.current,
          noteId,
          note.body.slice(0, from) + insert + note.body.slice(to),
        ),
      )
    }
    return { from: from + insert.length, to: from + insert.length }
  }
  async function addMobileImages(files, point) {
    if (imageBusy || blocked || !active) return
    const noteId = active.id
    setImageBusy(true)
    try {
      for (const file of files) {
        const src = await importImage(file, persistence.invoke)
        commit({
          ...current.current,
          assets: [...(current.current.assets ?? []), { name: file.name, src }],
        })
        point = insertImageMarkdown(markdownImage(file.name, src), point, noteId)
      }
    } catch (cause) {
      toast.error(t('images.importFailed', { error: friendlyError(cause) }))
    } finally {
      setImageBusy(false)
    }
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
            trash: 'trash.title',
            prefs: 'menu.settings',
          }[route.name] ?? 'menu.notes',
        )
  const copy = (text) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast(t('mobile.copied')))
      .catch(() => toast.error(t('mobile.copyFailed')))
  const [purgeId, setPurgeId] = useState(null)
  const sheetDrag = useRef(null)
  // Dragging the sheet heading down closes it; the close button and Back keep working.
  function endSheetDrag(allowClose) {
    const drag = sheetDrag.current
    sheetDrag.current = null
    if (dialog.current) dialog.current.style.transform = ''
    if (allowClose && drag && drag.dy > 80) back()
  }
  const [findOpen, setFindOpen] = useState(false)
  const [locate, setLocate] = useState(null)
  useEffect(() => {
    if (!locate || !active || active.id !== locate.id || editing) return
    const target = content.current?.querySelector(`[data-source-line="${locate.line}"]`)
    if (!target || active.body !== locate.body) {
      toast.info(t('mobile.taskMoved'))
    } else {
      target.scrollIntoView({ block: 'center' })
      target.classList.add('mobile-located')
      setTimeout(() => target.classList.remove('mobile-located'), 2500)
    }
    setLocate(null)
  }, [locate, active, editing])
  // Folded section lines belong to one version of one note; any edit can move the lines.
  const [fold, setFold] = useState({ id: null, body: null, lines: new Set() })
  const sharing = useRef(false)
  async function shareAsFile(note) {
    if (sharing.current) return
    sharing.current = true
    window.__shareFailed = () => toast.error(t('mobile.shareFailed'))
    try {
      await shareFile({ name: note.name, text: note.body })
    } catch {
      toast.error(t('mobile.shareFailed'))
    } finally {
      sharing.current = false
    }
  }
  async function share(note) {
    if (sharing.current) return
    sharing.current = true
    window.__shareFailed = () => toast.error(t('mobile.shareFailed'))
    try {
      const result = await shareText({ title: displayName(note.name), text: note.body })
      if (result === 'unavailable') copy(note.body)
    } catch {
      toast.error(t('mobile.shareFailed'))
    } finally {
      sharing.current = false
    }
  }
  if (blocked)
    return (
      <main className="mobile-shell" data-platform="mobile">
        <header className="mobile-header">
          <h1>Sloth Note</h1>
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
        {root && (
          <button
            className="mobile-icon"
            aria-label={t('mobile.more')}
            onClick={() => dispatch({ type: 'layer', route: { name: 'sheet' } })}
          >
            <MoreHorizontal size={22} />
          </button>
        )}
        <h1 ref={heading} tabIndex={-1} title={title}>
          {root && route.name === 'notes' ? 'Sloth Note' : title}
        </h1>
        {active && (
          <button
            className={editing ? 'mobile-edit' : 'mobile-icon'}
            aria-label={editing ? t('mobile.done') : t('mobile.edit')}
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
              <Pencil size={22} aria-hidden="true" />
            )}
          </button>
        )}
        {active && (
          <button
            className="mobile-icon"
            data-note-actions
            aria-label={t('mobile.noteActions', { name: displayName(active.name) })}
            onClick={() => dispatch({ type: 'layer', route: { name: 'sheet', id: active.id } })}
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
      {findOpen && active && !editing && (
        <ReadingFind container={content} version={active.body} onClose={() => setFindOpen(false)} />
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
                wrapLines={prefs.wrapLines !== false}
                wrapPage={pageWrap}
                key={active.id}
                noteId={active.id}
                notes={data.notes}
                body={active.body}
                onChange={updateBody}
                onOpenWiki={openWiki}
                onCopy={copy}
                imageBusy={imageBusy}
                onImageFiles={addMobileImages}
                onImageUrl={(url, point) =>
                  insertImageMarkdown(markdownImage(t('block.image'), url), point, active.id)
                }
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
                wrapLines={prefs.wrapLines !== false}
                wrapPage={pageWrap}
                text={active.body}
                notes={data.notes}
                onChange={blocked ? undefined : updateBody}
                onOpenWiki={openWiki}
                onCopy={copy}
                focusableTables
                folds={fold.id === active.id && fold.body === active.body ? fold.lines : undefined}
                onToggleFold={(line) => {
                  const same = fold.id === active.id && fold.body === active.body
                  const lines = new Set(same ? fold.lines : [])
                  if (!lines.delete(line)) lines.add(line)
                  setFold({ id: active.id, body: active.body, lines })
                }}
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
            onJump={(id, offset) => {
              const note = current.current.notes.find((item) => item.id === id)
              setLocate(
                offset == null || !note
                  ? null
                  : { id, line: note.body.slice(0, offset).split('\n').length, body: note.body },
              )
              openNote(id)
            }}
            onToggle={(id, mark) => {
              if (!blocked) {
                const note = current.current.notes.find((item) => item.id === id)
                if (note) {
                  const before = note.body
                  const next = updateMobileNote(current.current, id, toggleTask(before, mark))
                  const after = next.notes.find((item) => item.id === id)?.body
                  commit(next, 'tarefa')
                  toast(t('mobile.taskUpdated'), {
                    action: {
                      label: t('mobile.undo'),
                      onClick: () => {
                        // Only undo while the note is exactly as this change left it.
                        const now = current.current.notes.find((item) => item.id === id)
                        if (now?.body === after)
                          commit(updateMobileNote(current.current, id, before), 'tarefa')
                        else toast.info(t('mobile.taskUndoChanged'))
                      },
                    },
                  })
                }
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
        {route.name === 'prefs' && (
          <section className="mobile-prefs" aria-label={t('menu.settings')}>
            <label htmlFor="mobile-font">{t('settings.fontSize')}</label>
            <p>{t('settings.fontHint')}</p>
            <div>
              <input
                id="mobile-font"
                type="range"
                min={FONT_SIZE.min}
                max={FONT_SIZE.max}
                step={1}
                value={prefs.fontSize}
                disabled={blocked}
                onChange={(event) => updatePrefs({ fontSize: Number(event.target.value) })}
              />
              <output htmlFor="mobile-font">{prefs.fontSize}px</output>
            </div>
            <button
              disabled={blocked || prefs.fontSize === FONT_SIZE.default}
              onClick={() => updatePrefs({ fontSize: FONT_SIZE.default })}
            >
              {t('settings.fontReset')}
            </button>
            <BackupPanel
              current={current}
              persistence={persistence}
              commit={commit}
              blocked={blocked}
            />
            <button onClick={() => dispatch({ type: 'push', route: { name: 'settings' } })}>
              <NotebookText size={20} />
              {t('settings.changelog')}
            </button>
          </section>
        )}
        {route.name === 'trash' && (
          <section className="mobile-trash" aria-label={t('trash.title')}>
            {data.trash.length === 0 && <p className="mobile-empty">{t('trash.empty')}</p>}
            {[...data.trash].reverse().map(({ note }) => (
              <article key={note.id} className="mobile-trash-row">
                <h2>{displayName(note.name)}</h2>
                <p>{notePreview(note.body)}</p>
                <div>
                  <button
                    disabled={blocked}
                    onClick={() => {
                      commit(restoreFromTrash(current.current, note.id))
                      toast(t('mobile.restored'))
                    }}
                  >
                    {t('trash.restore')}
                  </button>
                  {purgeId === note.id ? (
                    <>
                      <button
                        className="danger"
                        disabled={blocked}
                        onClick={() => {
                          commit(purgeFromTrash(current.current, note.id))
                          setPurgeId(null)
                        }}
                      >
                        {t('mobile.confirmPurge')}
                      </button>
                      <button onClick={() => setPurgeId(null)}>{t('dialog.cancel')}</button>
                    </>
                  ) : (
                    <button
                      className="danger"
                      disabled={blocked}
                      onClick={() => setPurgeId(note.id)}
                    >
                      {t('trash.purge')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
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
            <div
              className="mobile-sheet-heading"
              data-sheet-drag
              onPointerDown={(event) => {
                if (event.target.closest('button, input')) return
                sheetDrag.current = { y: event.clientY, dy: 0 }
                try {
                  event.currentTarget.setPointerCapture(event.pointerId)
                } catch {
                  /* synthetic or already-ended pointer */
                }
              }}
              onPointerMove={(event) => {
                const drag = sheetDrag.current
                if (!drag) return
                drag.dy = Math.max(0, event.clientY - drag.y)
                if (dialog.current) dialog.current.style.transform = `translateY(${drag.dy}px)`
              }}
              onPointerUp={() => endSheetDrag(true)}
              onPointerCancel={() => endSheetDrag(false)}
            >
              <h2 className="mobile-sheet-title">
                {actionsNote ? displayName(actionsNote.name) : 'Sloth Note'}
              </h2>
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
                  onClick={() => {
                    const currentValue = Object.hasOwn(prefs.wrapLinesByNote ?? {}, actionsNote.id)
                      ? prefs.wrapLinesByNote[actionsNote.id]
                      : prefs.wrapLines !== false
                    updatePrefs({
                      wrapLinesByNote: {
                        ...prefs.wrapLinesByNote,
                        [actionsNote.id]: !currentValue,
                      },
                    })
                    back()
                  }}
                >
                  {t('menu.wrapPage')}
                </button>
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
                {route.name === 'note' && active?.id === actionsNote.id && !editing && (
                  <button
                    onClick={() => {
                      setFindOpen(true)
                      back()
                    }}
                  >
                    <Search size={20} />
                    {t('find.label')}
                  </button>
                )}
                <button onClick={() => share(actionsNote)}>
                  {canShare() ? <Share2 size={20} /> : <Copy size={20} />}
                  {t(canShare() ? 'mobile.share' : 'mobile.copyText')}
                </button>
                {canShareFile() && (
                  <button onClick={() => shareAsFile(actionsNote)}>
                    <FileText size={20} />
                    {t('mobile.shareFile')}
                  </button>
                )}
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
              <>
                <ThemeControl theme={prefs.theme} onChange={updatePrefs} />
                <button
                  onClick={() => {
                    dispatch({ type: 'push', route: { name: 'trash' } })
                  }}
                >
                  <Trash2 size={20} />
                  {t('trash.title')}
                  {data.trash.length ? ` (${data.trash.length})` : ''}
                </button>
                <button
                  onClick={() => {
                    dispatch({ type: 'push', route: { name: 'prefs' } })
                  }}
                >
                  <Settings size={20} />
                  {t('menu.settings')}
                </button>
                <button
                  onClick={() => {
                    updatePrefs({ wrapLines: prefs.wrapLines === false })
                    back()
                  }}
                >
                  {t('menu.wrapAll')}
                </button>
                <button
                  onClick={() => {
                    dispatch({ type: 'push', route: { name: 'settings' } })
                  }}
                >
                  <NotebookText size={20} />
                  {t('settings.changelog')}
                </button>
              </>
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
