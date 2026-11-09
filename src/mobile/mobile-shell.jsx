import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { version } from '../../package.json'
import {
  ArrowLeft,
  Check,
  Code2,
  FileText,
  Menu,
  Pencil,
  Image as ImageIcon,
  ListChecks,
  Monitor,
  Moon,
  MoreHorizontal,
  NotebookText,
  Pin,
  Plus,
  Search,
  Share2,
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
import { ReadingFind } from './reading-find.jsx'
import { Markdown } from '../markdown.jsx'
import { VisualEditor } from '../visual-editor.jsx'
import { displayName, notePreview } from '../note-title.js'
import { noteSearchResult } from '../note-search.js'
import { findNote } from '../markdown-model.js'
import {
  moveToTrash,
  nameFromHeading,
  purgeFromTrash,
  reconcileHeadingNames,
  restoreFromTrash,
} from '../notes.js'
import { clearImageCache, importImage, libraryImages, markdownImage } from '../images.js'
import { createFullBackup, readBackupBundle, restoreBackupImages } from '../backup.js'
import { ImageThumbnail } from '../components/image-library.jsx'
import { TasksLibrary } from '../components/tasks-library.jsx'
import { ChangelogPanel } from '../components/changelog-panel.jsx'
import { TrashLibrary } from '../components/trash-library.jsx'
import { noteTasks, syncLinkedTasks, toggleTask } from '../tasks.js'
import { ensureDocumentTitles } from '../title.js'
import { LANGUAGES, t } from '../i18n.js'
import { FONT_SIZE } from '../storage.js'
import { useInsets } from './use-insets.js'
import { useSystemBars } from './use-system-bars.js'
import { useNativeActions } from './use-native-actions.js'
import { canShareFile, shareFile } from './share.js'
import { useNavigation } from './use-navigation.js'
import { newMobileNote, renameMobileNote, updateMobileNote } from './note-actions.js'
import { SwipeNoteRow } from './swipe-note-row.jsx'
import { shareAndroidText } from './share.js'
import { createMobileBack } from './back.js'
import { saveTextFile } from './file-save.js'
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
  const [purgeId, setPurgeId] = useState(null)
  const [backupCandidate, setBackupCandidate] = useState(null)
  const [transferBusy, setTransferBusy] = useState('')
  const transferPending = useRef(false)
  const backupInput = useRef(null)
  const noteInput = useRef(null)
  function beginTransfer(label) {
    if (transferPending.current) return false
    transferPending.current = true
    setTransferBusy(label)
    return true
  }
  function endTransfer() {
    transferPending.current = false
    setTransferBusy('')
  }
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
  const navigationState = useRef(state)
  navigationState.current = state
  const route = state.screens.at(-1)
  const layer = state.layers.at(-1)
  const active = route.name === 'note' ? data.notes.find((note) => note.id === route.id) : null
  const pageWrap =
    active && Object.hasOwn(prefs.wrapLinesByNote ?? {}, active.id)
      ? prefs.wrapLinesByNote[active.id]
      : prefs.wrapLines !== false
  const sheetDrag = useRef(null)
  // Dragging the sheet heading down closes it; the close button and Back keep working.
  function endSheetDrag(allowClose) {
    const drag = sheetDrag.current
    sheetDrag.current = null
    if (dialog.current) dialog.current.style.transform = ''
    if (allowClose && drag && drag.dy > 80) back()
  }
  const [findOpen, setFindOpen] = useState(false)
  const [fold, setFold] = useState({ id: null, body: null, lines: new Set() })
  const [editingId, setEditingId] = useState(null)
  const editing = active && editingId === active.id
  const codeNotes = Array.isArray(prefs.mobileCodeNotes) ? prefs.mobileCodeNotes : []
  const sourceMode = Boolean(active && codeNotes.includes(active.id))
  function setNoteMode(id, source) {
    const saved = Array.isArray(current.current.preferences.mobileCodeNotes)
      ? current.current.preferences.mobileCodeNotes.filter((value) => value !== id)
      : []
    updatePrefs({ mobileCodeNotes: source ? [...saved, id] : saved })
  }
  function insertSymbol(text) {
    const view = editor.current
    if (!view || view.composing || view.compositionStarted) return
    view.dispatch(view.state.replaceSelection(text))
    view.focus()
  }
  const [showDone, setShowDone] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const sharePending = useRef(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const content = useRef(null)
  const editor = useRef(null)
  const focusAfterClose = useRef(null)
  const dialog = useRef(null)
  const hadLayer = useRef(false)
  const heading = useRef(null)
  const previousRoute = useRef(null)
  const restoreFocus = useRef(null)
  const taskJump = useRef(null)
  const back = () => {
    if (transferPending.current) return
    document.activeElement?.blur?.()
    dispatch({ type: 'back' })
  }
  useEffect(() => {
    if (!window.SlothShare?.finishActivity) return
    const handleBack = createMobileBack({
      getState: () => navigationState.current,
      keyboardOpen: () => ['open', 'opening'].includes(document.documentElement.dataset.keyboard),
      back: () => dispatch({ type: 'back' }),
      hideKeyboard: () => window.SlothShare.hideKeyboard(),
      flush: async () => {
        const failure = await writer.current.whenIdle()
        await store.noteHistory.flush()
        return failure
      },
      finish: () => window.SlothShare.finishActivity(),
    })
    const guardedBack = () => (transferPending.current ? true : handleBack())
    window.__slothMobileBack = guardedBack
    return () => {
      if (window.__slothMobileBack === guardedBack) delete window.__slothMobileBack
    }
    // dispatch is backed by the stable navigation controller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writer, store.noteHistory])
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
    if (route.name === 'note' && taskJump.current?.id === route.id) {
      const target = taskJump.current
      taskJump.current = null
      const note = current.current.notes.find((item) => item.id === route.id)
      const task = note && noteTasks(note.body).find((item) => item.offset === target.offset)
      const element =
        task &&
        note.body.slice(
          task.offset,
          note.body.indexOf('\n', task.offset) < 0
            ? undefined
            : note.body.indexOf('\n', task.offset),
        ) === target.line
          ? content.current?.querySelector(`li[data-source-line="${task.line}"]`)
          : null
      if (element) {
        element.scrollIntoView({ block: 'center' })
        element.classList.add('mobile-task-highlight')
        setTimeout(() => element.classList.remove('mobile-task-highlight'), 3000)
      } else toast.info(t('mobile.taskMissing'))
    }
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
    if (layer.name === 'dialog')
      (dialog.current?.querySelector('input') ?? dialog.current?.querySelector('button'))?.focus()
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
    if (closeSheet && route.name === 'note' && route.id === id) window.history.go(-2)
    else if (closeSheet) back()
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
            settings: 'menu.settings',
            changelog: 'settings.changelog',
            trash: 'trash.title',
          }[route.name] ?? 'menu.notes',
        )
  async function importNote(file) {
    if (!file || !beginTransfer(t('mobile.noteImportWorking'))) return
    try {
      if (!/\.(md|markdown|txt)$/i.test(file.name) || file.size > 10 * 1024 * 1024)
        throw new Error('invalid file')
      const text = new TextDecoder('utf-8', { fatal: true })
        .decode(await file.arrayBuffer())
        .replace(/\r\n/g, '\n')
      const stem =
        file.name
          .replace(/\.(md|markdown|txt)$/i, '')
          .replace(/[\r\n]/g, ' ')
          .trim() || 'Nota'
      const body = /^#\s+\S/.test(text) ? text : `# ${stem}\n\n${text}`
      const id = crypto.randomUUID()
      const old = current.current
      const note = {
        id,
        name: nameFromHeading(body, old.notes, id) ?? 'new note.md',
        body,
        revision: 0,
      }
      commit({ ...old, notes: [note, ...old.notes], openIds: [...old.openIds, id], activeId: id })
      const failure = await writer.current.whenIdle()
      dispatch({ type: 'tab', name: 'notes' })
      if (!failure) toast.success(t('mobile.noteImported'))
    } catch {
      toast.error(t('mobile.noteImportFailed'))
    } finally {
      endTransfer()
      if (noteInput.current) noteInput.current.value = ''
    }
  }
  async function exportNote(note) {
    if (!beginTransfer(t('mobile.noteExportWorking'))) return
    try {
      const status = await saveTextFile(note.name, 'text/markdown', note.body)
      if (status === 'saved') toast.success(t('mobile.noteExportSaved'))
      else if (status === 'download') toast.success(t('mobile.noteExportStarted'))
    } catch {
      toast.error(t('mobile.noteExportFailed'))
    } finally {
      endTransfer()
    }
  }
  async function exportBackup() {
    if (!beginTransfer(t('mobile.backupWorking'))) return
    try {
      const body = await createFullBackup(current.current, persistence.invoke)
      if (new Blob([body]).size > 100 * 1024 * 1024) throw new Error(t('mobile.backupTooLarge'))
      const status = await saveTextFile('sloth-note-backup.json', 'application/json', body)
      if (status === 'saved') toast.success(t('mobile.backupSaved'))
      else if (status === 'download') toast.success(t('backup.downloadStarted'))
    } catch (cause) {
      toast.error(t('backup.failed', { error: friendlyError(cause) }))
    } finally {
      endTransfer()
    }
  }
  async function chooseBackup(file) {
    if (!file || !beginTransfer(t('mobile.backupWorking'))) return
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error(t('mobile.backupTooLarge'))
      const candidate = readBackupBundle(await file.text())
      if (
        [...candidate.document.notes, ...candidate.document.trash.map((entry) => entry.note)].some(
          (note) => note.external,
        )
      )
        throw new Error(t('mobile.backupExternal'))
      setBackupCandidate(candidate)
      dispatch({ type: 'layer', route: { name: 'dialog' } })
    } catch (cause) {
      const known = [t('mobile.backupTooLarge'), t('mobile.backupExternal')]
      toast.error(known.includes(cause?.message) ? cause.message : t('mobile.backupInvalid'))
    } finally {
      endTransfer()
      if (backupInput.current) backupInput.current.value = ''
    }
  }
  async function restoreBackup() {
    if (!backupCandidate || !beginTransfer(t('mobile.restoreWorking'))) return
    try {
      const failure = await writer.current.whenIdle()
      if (failure) throw new Error(failure)
      let restored = ensureDocumentTitles(
        await restoreBackupImages(backupCandidate, persistence.invoke),
      )
      restored = reconcileHeadingNames({ ...restored, notes: syncLinkedTasks(restored.notes) })
      const saveError = await persistence.save(restored)
      if (saveError) throw new Error(saveError)
      clearImageCache()
      store.replaceSavedDocument(restored)
      setBackupCandidate(null)
      setEditingId(null)
      dispatch({ type: 'tab', name: 'notes' })
      toast.success(t('mobile.backupRestored'))
    } catch (cause) {
      toast.error(t('mobile.restoreFailed', { error: friendlyError(cause) }))
    } finally {
      endTransfer()
    }
  }
  const copy = (text) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast(t('mobile.copied')))
      .catch(() => toast.error(t('mobile.copyFailed')))
  const shareNote = async (note) => {
    if (sharePending.current) return
    sharePending.current = true
    setShareBusy(true)
    try {
      if (window.SlothShare) {
        await shareAndroidText(note.body)
      } else if (navigator.share) {
        await navigator.share({ title: displayName(note.name), text: note.body })
      } else {
        await navigator.clipboard.writeText(note.body)
        toast(t('mobile.copied'))
      }
      back()
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error(t('mobile.shareFailed'))
    } finally {
      sharePending.current = false
      setShareBusy(false)
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
      onKeyDownCapture={(event) => {
        if (transferPending.current) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
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
        {active && (
          <button
            className="mobile-icon mobile-edit"
            aria-label={t(editing ? 'mobile.done' : 'mobile.edit')}
            title={t(editing ? 'mobile.done' : 'mobile.edit')}
            disabled={blocked}
            onClick={() => {
              if (editing) {
                editor.current?.contentDOM.blur()
                setEditingId(null)
              } else setEditingId(active.id)
            }}
          >
            {editing ? <Check size={22} /> : <Pencil size={22} />}
          </button>
        )}
        {active && editing && (
          <button
            className="mobile-icon"
            aria-label={t(sourceMode ? 'mobile.visualMode' : 'mobile.codeMode')}
            title={t(sourceMode ? 'mobile.visualMode' : 'mobile.codeMode')}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setNoteMode(active.id, !sourceMode)}
          >
            {sourceMode ? <FileText size={22} /> : <Code2 size={22} />}
          </button>
        )}
        {active && !editing && (
          <button
            className="mobile-icon"
            aria-label={t('mobile.noteActions', { name: displayName(active.name) })}
            onClick={() => dispatch({ type: 'layer', route: { name: 'sheet', id: active.id } })}
          >
            <MoreHorizontal size={22} />
          </button>
        )}
      </header>
      {(error || blocked) && (
        <div className="mobile-error" role="alert">
          <p>
            {blocked ? t('mobile.readFailed') : t('mobile.saveFailed')} {error}
          </p>
          <button onClick={() => (blocked ? onReload() : writer.current.write(current.current))}>
            {t('mobile.retry')}
          </button>
        </div>
      )}
      {warning && (
        <div className="mobile-error" role="alert">
          <p>{warning}</p>
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
                sourceMode={sourceMode}
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
              if (note && Number.isInteger(offset)) {
                const end = note.body.indexOf('\n', offset)
                taskJump.current = {
                  id,
                  offset,
                  line: note.body.slice(offset, end < 0 ? undefined : end),
                }
              }
              openNote(id)
            }}
            onToggle={(id, mark) => {
              if (!blocked) {
                const note = current.current.notes.find((item) => item.id === id)
                if (note) {
                  const updated = toggleTask(note.body, mark)
                  if (updated === note.body) return
                  commit(updateMobileNote(current.current, id, updated), 'tarefa')
                  toast(t('mobile.taskChanged'), {
                    action: {
                      label: t('mobile.undo'),
                      onClick: () => {
                        const latest = current.current.notes.find((item) => item.id === id)
                        if (!latest || latest.body !== updated) {
                          toast.info(t('mobile.taskChangedSince'))
                          return
                        }
                        commit(
                          updateMobileNote(current.current, id, toggleTask(latest.body, mark)),
                          'tarefa',
                        )
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
        {route.name === 'trash' && (
          <TrashLibrary
            trash={data.trash}
            query=""
            onRestore={(id) => commit(restoreFromTrash(current.current, id))}
            onPurge={(id) => {
              setPurgeId(id)
              dispatch({ type: 'layer', route: { name: 'dialog', id } })
            }}
          />
        )}
        {route.name === 'settings' && (
          <section className="mobile-settings" aria-label={t('menu.settings')}>
            <label htmlFor="mobile-language">{t('settings.language')}</label>
            <select
              id="mobile-language"
              value={prefs.language}
              onChange={(event) => updatePrefs({ language: event.target.value })}
            >
              {Object.entries(LANGUAGES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="mobile-font-size">
              {t('settings.fontSize')}: {prefs.fontSize}px
            </label>
            <input
              id="mobile-font-size"
              type="range"
              min={FONT_SIZE.min}
              max={FONT_SIZE.max}
              value={prefs.fontSize}
              onChange={(event) => updatePrefs({ fontSize: Number(event.target.value) })}
            />
            <p>{t('mobile.backupDetails')}</p>
            <button disabled={Boolean(transferBusy)} onClick={exportBackup}>
              {t('mobile.backupSave')}
            </button>
            <button disabled={Boolean(transferBusy)} onClick={() => backupInput.current?.click()}>
              {t('mobile.backupRestore')}
            </button>
            <input
              ref={backupInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => chooseBackup(event.target.files?.[0])}
            />
            <button onClick={() => dispatch({ type: 'push', route: { name: 'changelog' } })}>
              {t('settings.changelog')}
            </button>
            <h2>{t('mobile.about')}</h2>
            <p>Sloth Note · {t('mobile.version', { version })}</p>
          </section>
        )}
        {route.name === 'changelog' && <ChangelogPanel />}
      </div>
      {editing && sourceMode && (
        <div className="mobile-symbols" role="toolbar" aria-label={t('mobile.symbols')}>
          {['\t', '#', '-', '[ ]', '|', '`', '*'].map((symbol) => (
            <button
              key={symbol}
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => insertSymbol(symbol)}
              aria-label={symbol === '\t' ? 'Tab' : symbol}
            >
              {symbol === '\t' ? 'Tab' : symbol}
            </button>
          ))}
        </div>
      )}
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
      {active && (
        <footer className="mobile-save" role="status">
          {error || blocked ? t('mobile.notSaved') : saving ? t('save.saving') : t('mobile.saved')}
        </footer>
      )}
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
        <button
          aria-label={t('mobile.more')}
          aria-haspopup="dialog"
          aria-expanded={Boolean(layer?.name === 'sheet' && !layer.id)}
          onClick={() => dispatch({ type: 'layer', route: { name: 'sheet' } })}
        >
          <Menu size={22} aria-hidden="true" />
          <span>Menu</span>
        </button>
      </nav>

      {layer && (
        <div
          className={`mobile-scrim${layer.name === 'sheet' && !layer.id ? ' mobile-drawer-scrim' : ''}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) back()
          }}
        >
          <section
            ref={dialog}
            className={`mobile-sheet${layer.name === 'sheet' && !layer.id ? ' mobile-drawer' : ''}`}
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
            {layer.name === 'dialog' && route.name === 'settings' && backupCandidate ? (
              <>
                <p>
                  {t('dialog.backupReplace', {
                    notes: backupCandidate.document.notes.length,
                    trash: backupCandidate.document.trash.length,
                  })}
                </p>
                <button
                  disabled={Boolean(transferBusy)}
                  onClick={() => {
                    setBackupCandidate(null)
                    back()
                  }}
                >
                  {t('dialog.cancel')}
                </button>
                <button disabled={Boolean(transferBusy)} className="danger" onClick={restoreBackup}>
                  {t('dialog.backupReplaceConfirm')}
                </button>
              </>
            ) : layer.name === 'dialog' && route.name === 'trash' ? (
              <>
                <p>
                  {t('dialog.purge', {
                    name: data.trash.find((entry) => entry.note.id === purgeId)?.note.name ?? '',
                  })}
                </p>
                <button onClick={back}>{t('dialog.cancel')}</button>
                <button
                  className="danger"
                  onClick={() => {
                    commit(purgeFromTrash(current.current, purgeId))
                    setPurgeId(null)
                    back()
                  }}
                >
                  {t('dialog.purgeConfirm')}
                </button>
              </>
            ) : layer.name === 'dialog' ? (
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
                <button
                  onClick={() => {
                    setFindOpen(true)
                    back()
                  }}
                >
                  {t('mobile.readingFind')}
                </button>
                {canShareFile() && (
                  <button
                    onClick={() =>
                      shareFile({ name: actionsNote.name, text: actionsNote.body }).catch(() =>
                        toast.error(t('mobile.shareFailed')),
                      )
                    }
                  >
                    {t('mobile.shareFile')}
                  </button>
                )}
                <button disabled={shareBusy} onClick={() => shareNote(actionsNote)}>
                  <Share2 size={20} />
                  {t(window.SlothShare || navigator.share ? 'mobile.share' : 'mobile.copyText')}
                </button>
                <button disabled={Boolean(transferBusy)} onClick={() => exportNote(actionsNote)}>
                  {t('menu.export')}
                </button>
                <p className="mobile-export-hint">{t('mobile.noteExportHint')}</p>
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
                <button onClick={() => noteInput.current?.click()}>{t('menu.import')}</button>
                <button
                  onClick={() => {
                    updatePrefs({ wrapLines: prefs.wrapLines === false })
                    back()
                  }}
                >
                  {t('menu.wrapAll')}
                </button>
                <button onClick={() => dispatch({ type: 'push', route: { name: 'trash' } })}>
                  <Trash2 size={20} />
                  {t('trash.title')}
                </button>
                <button
                  onClick={() => {
                    dispatch({ type: 'push', route: { name: 'settings' } })
                  }}
                >
                  <NotebookText size={20} />
                  {t('menu.settings')}
                </button>
                <button onClick={() => dispatch({ type: 'push', route: { name: 'changelog' } })}>
                  <NotebookText size={20} />
                  {t('settings.changelog')}
                </button>
              </>
            )}
          </section>
        </div>
      )}
      <input
        ref={noteInput}
        type="file"
        accept="text/markdown,text/plain,.md,.markdown,.txt"
        hidden
        onChange={(event) => importNote(event.target.files?.[0])}
      />
      {transferBusy && (
        <div className="mobile-transfer" role="status">
          {transferBusy}
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
