import { CoverPicker } from '../components/cover-picker.jsx'
import { NoteCoverBanner } from '../components/note-cover-banner.jsx'
import { EditorToggleSettings } from '../components/settings-sections.jsx'
import { noteCover } from '../note-cover.js'
import {
  applyNoteCover,
  setNoteBoardView,
  setNoteGroupDocument,
  toggleNoteWrap,
  togglePinnedNote,
} from '../document-mutations.js'
import { useWorkspaceBoot } from '../hooks/use-workspace-boot.js'
import { useTheme } from '../hooks/use-theme.js'
import { DocumentWidthPresets } from '../components/document-width-presets.jsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { runNoteTransition } from './view-transition.js'
import { triggerHaptic } from './haptics.js'
import { adjacentOpenNoteId, classifyHeaderGesture } from './header-gestures.js'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCheck,
  ChevronsDownUp,
  ChevronsUpDown,
  Code2,
  Columns3,
  Copy,
  FileInput,
  FileOutput,
  FilePlus,
  FileText,
  Folder,
  Info,
  Menu,
  Pencil,
  Image as ImageIcon,
  KeyboardOff,
  ListChecks,
  Monitor,
  Moon,
  MoreHorizontal,
  NotebookText,
  NotebookPen,
  Pin,
  Redo2,
  ScanSearch,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sun,
  Trash2,
  Undo2,
  WrapText,
  X,
  Zap,
} from 'lucide-react'
import { redo, undo } from '@codemirror/commands'
import { Toaster, toast } from 'sonner'
import { useNotesStore } from '../hooks/use-notes-store.js'
import { usePrefs } from '../hooks/use-prefs.js'
import { friendlyError } from '../errors.js'
import { protectPendingSaves } from '../save-lifecycle.js'
import { ReadingFind } from './reading-find.jsx'
import { EditorFind } from './editor-find.jsx'
import { CommandSheet } from './command-sheet.jsx'
import { textStatistics } from '../text-statistics.js'
import { headingSections } from '../sections.js'
import { moveSectionBy } from '../section-move.js'
import { foldAll, unfoldAll } from '../editor/folding.js'
import { applyChanges } from '../list-indent.js'
import { Markdown } from '../markdown.jsx'
import { VisualEditor } from '../visual-editor.jsx'
import { DocumentOutline } from '../components/document-outline.jsx'
import { EditorView } from '@codemirror/view'
import { displayName, notePreview } from '../note-title.js'
import { noteSearchResult } from '../note-search.js'
import { findNote, wikiParts } from '../markdown-model.js'
import {
  moveToTrash,
  nameFromHeading,
  purgeFromTrash,
  reconcileHeadingNames,
  restoreFromTrash,
} from '../notes.js'
import {
  clearImageCache,
  importImage,
  libraryImages,
  markdownImage,
  removeDocumentImage,
} from '../images.js'
import { createFullBackup, readBackupBundle, restoreBackupImages } from '../backup.js'
import { AboutPanel } from '../components/about-panel.jsx'
import { HistoryPanel } from '../components/history-panel.jsx'
import { SyncPanel } from '../components/sync-panel.jsx'
import { useSync } from '../hooks/use-sync.js'
import { ImageThumbnail } from '../components/image-library.jsx'
import { TasksLibrary } from '../components/tasks-library.jsx'
import { ChangelogPanel } from '../components/changelog-panel.jsx'
import { TrashLibrary } from '../components/trash-library.jsx'
import { noteTasks, syncLinkedTasks, taskSettings, toggleTask } from '../tasks.js'
import { ensureDocumentTitles } from '../title.js'
import { GuideLibrary, guideDocument, guideTarget } from '../components/guide-library.jsx'
import { LANGUAGES, currentLanguage, t } from '../i18n.js'
import { isTaskNote, makeTaskNote } from '../task-note.js'
import { setOwnTemplates, setTemplateProfile } from '../templates.js'
import { PropertiesDock } from '../components/properties-panel.jsx'
import { frontmatterEnd } from '../frontmatter.js'
import { FONT_SIZE } from '../storage.js'
import { useInsets, useKeyboardOpen } from './use-insets.js'
import { useSystemBars } from './use-system-bars.js'
import { useNativeActions } from './use-native-actions.js'
import { canShareFile, shareFile } from './share.js'
import { useNavigation } from './use-navigation.js'
import { newMobileNote, renameMobileNote, updateMobileNote } from './note-actions.js'
import { SwipeNoteRow } from './swipe-note-row.jsx'
import { shareAndroidText } from './share.js'
import { backEnabled, createMobileBack } from './back.js'
import { EditingSheet } from './editing-sheet.jsx'
import { TaskBoard } from '../components/task-board.jsx'
import { FormattingBar } from './formatting-bar.jsx'
import { flushOnHide } from './lifecycle.js'
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
  const { started, failure, retry, reload } = useWorkspaceBoot()
  if (!started)
    return (
      <main className="mobile-shell" data-platform="mobile">
        <header className="mobile-header">
          <h1>Sloth Note</h1>
        </header>
        <div className="mobile-empty" role={failure ? 'alert' : 'status'}>
          <p>{failure ? t('app.openFailed', { failure }) : t('app.opening')}</p>
          {failure && <button onClick={retry}>{t('mobile.retry')}</button>}
        </div>
      </main>
    )
  return <MobileWorkspace {...started} onReload={reload} />
}

function MobileWorkspace({ persistence, loaded, onReload }) {
  const [rename, setRename] = useState(null)
  const [renameError, setRenameError] = useState('')
  const [purgeId, setPurgeId] = useState(null)
  const [trashEmpty, setTrashEmpty] = useState(false)
  const [backupCandidate, setBackupCandidate] = useState(null)
  const [transferBusy, setTransferBusy] = useState('')
  const headerGesture = useRef(null)
  const transferPending = useRef(false)
  const [replaceConfirm, setReplaceConfirm] = useState(false)
  const [replaceBusy, setReplaceBusy] = useState(false)
  const damaged = loaded.raw ?? null
  const backupInput = useRef(null)
  const imageInput = useRef(null)
  const imagePoint = useRef(null)
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
  taskSettings.dates = prefs.taskDates !== false
  setOwnTemplates(data.notes, prefs.templateNotes, t('templates.own'))
  const sync = useSync({
    current,
    commit,
    invoke: persistence.invoke,
    blocked,
    onImagesChanged: clearImageCache,
  })
  setTemplateProfile(sync.status.account?.name || sync.status.account?.email)
  const { scheduleAfterEdit } = sync
  useEffect(() => {
    scheduleAfterEdit()
  }, [data.notes, data.trash, scheduleAfterEdit])
  function updatePrefs(change) {
    savePrefs('wrapLines' in change ? { ...change, wrapLinesByNote: {} } : change)
  }
  const { state, dispatch } = useNavigation(current)
  const keyboardOpen = useKeyboardOpen()
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
  const [findInitialQuery, setFindInitialQuery] = useState('')
  const pendingHeadingLine = useRef(null)
  useEffect(() => {
    const onShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'p') {
        event.preventDefault()
        dispatch({
          type: 'layer',
          route: { name: 'commands', prefix: event.shiftKey ? '>' : '' },
        })
      } else if (key === 'f' && route.name === 'note') {
        event.preventDefault()
        dispatch({ type: 'layer', route: { name: 'find' } })
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [dispatch, route.name])
  useEffect(() => {
    if (!active || !pendingHeadingLine.current) return
    const line = pendingHeadingLine.current
    pendingHeadingLine.current = null
    const timer = setTimeout(() => {
      content.current
        ?.querySelector(`[data-source-line="${line}"]`)
        ?.scrollIntoView({ block: 'start' })
    }, 0)
    return () => clearTimeout(timer)
  }, [active])
  const [fold, setFold] = useState({ id: null, body: null, lines: new Set() })
  const [editingId, setEditingId] = useState(null)
  const editing = active && editingId === active.id
  const codeNotes = Array.isArray(prefs.mobileCodeNotes) ? prefs.mobileCodeNotes : []
  const sourceMode = Boolean(active && codeNotes.includes(active.id))
  // The board view is shared with the desktop (prefs.boardNotes); editing always shows the text.
  const boardView = Boolean(active && prefs.boardNotes?.[active.id])
  function setBoardView(id, board) {
    updatePrefs(setNoteBoardView(current.current.preferences, id, board))
  }
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
  const [imagesFilter, setImagesFilter] = useState('all')
  const [selectedImage, setSelectedImage] = useState(null)
  const [pendingInsertImage, setPendingInsertImage] = useState(null)
  const cameraInput = useRef(null)
  const [shareBusy, setShareBusy] = useState(false)
  const sharePending = useRef(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const content = useRef(null)
  const editor = useRef(null)
  const focusAfterClose = useRef(null)
  const dialog = useRef(null)
  const hadLayer = useRef(false)
  const heading = useRef(null)
  const previousRoute = useRef(null)
  const restoreFocus = useRef(null)
  const taskJump = useRef(null)
  const noteViewState = useRef(new Map())
  const back = () => {
    if (transferPending.current) return
    document.activeElement?.blur?.()
    dispatch({ type: 'back' })
  }
  const savingRef = useRef(saving)
  savingRef.current = saving
  useEffect(() => {
    window.SlothSystem?.setBackEnabled?.(backEnabled(state, { saving, error: Boolean(error) }))
  }, [state, saving, error])
  useEffect(() => {
    if (!window.SlothShare?.finishActivity) return
    const handleBack = createMobileBack({
      getState: () => navigationState.current,
      keyboardOpen: () => ['open', 'opening'].includes(document.documentElement.dataset.keyboard),
      pending: () => savingRef.current,
      back: () => dispatch({ type: 'back' }),
      hideKeyboard: () => window.SlothShare.hideKeyboard(),
      flush: async () => {
        const failure = await writer.current.whenIdle()
        await store.noteHistory.flush()
        return failure
      },
      finish: () => window.SlothShare.finishActivity(),
      onPending: () => toast(t('mobile.exitPending'), { id: 'mobile-exit' }),
      onFailed: () => toast.error(t('mobile.exitFailed'), { id: 'mobile-exit' }),
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
  const searchVisible = searchOpen || Boolean(query)
  const recentSearches = Array.isArray(prefs.mobileRecentSearches)
    ? prefs.mobileRecentSearches.filter((term) => typeof term === 'string').slice(0, 5)
    : []
  const recentNotes = Array.isArray(prefs.mobileRecentNotes) ? prefs.mobileRecentNotes : []
  const root = state.screens.length === 1
  const actionsNote = layer?.id && data.notes.find((note) => note.id === layer.id)

  useTheme(prefs.theme)
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
    const removeFlush = flushOnHide(window, flush)
    return () => {
      stopped = true
      cleanup?.()
      removeFlush()
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

  function saveActiveNoteView() {
    if (!active) return
    noteViewState.current.set(active.id, {
      editing: Boolean(editing),
      scroll: content.current?.scrollTop ?? route.scroll ?? 0,
      cursor: editor.current?.state.selection.main.head ?? route.cursor ?? 2,
    })
  }
  function openNote(id, edit = undefined) {
    saveActiveNoteView()
    document.activeElement?.blur?.()
    const saved = noteViewState.current.get(id)
    const nextEdit = edit === undefined ? Boolean(saved?.editing) : Boolean(edit)
    setEditingId(nextEdit ? id : null)
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
    runNoteTransition(() =>
      flushSync(() =>
        dispatch({
          type: 'push',
          route: { name: 'note', id, scroll: saved?.scroll ?? 0, cursor: saved?.cursor },
        }),
      ),
    )
  }
  function foldAllSections() {
    if (!active) return
    if (editing && editor.current) {
      foldAll(editor.current)
      return
    }
    const lines = new Set(
      headingSections(active.body)
        .filter((heading) => heading.level > 0)
        .map((heading) => heading.line),
    )
    setFold({ id: active.id, body: active.body, lines })
  }
  function unfoldAllSections() {
    if (!active) return
    if (editing && editor.current) {
      unfoldAll(editor.current)
      return
    }
    setFold({ id: active.id, body: active.body, lines: new Set() })
  }
  function moveNoteSection(line, direction) {
    if (!active || blocked) return
    const moved = moveSectionBy(active.body, line, direction)
    if (!moved?.changes?.length) return
    if (editing && editor.current) {
      editor.current.dispatch({
        changes: moved.changes,
        selection: { anchor: moved.anchor },
        userEvent: 'move',
        scrollIntoView: true,
      })
      return
    }
    const previousBody = active.body
    const nextBody = applyChanges(previousBody, moved.changes)
    updateBody(nextBody)
    toast(t('mobile.moveSection'), {
      duration: 8000,
      action: {
        label: t('mobile.undo'),
        onClick: () => updateBody(previousBody),
      },
    })
  }
  function createNote(title = '') {
    if (blocked) return
    const next = newMobileNote(current.current, title)
    commit(next)
    openNote(next.activeId, true)
  }
  function openGuide(id = 'start') {
    dispatch({ type: 'push', route: { name: 'guide', id } })
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
  function receiveOpenedFile(payload) {
    if (!payload || blocked) return
    let body = ''
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload)
        body = typeof parsed?.text === 'string' ? parsed.text : payload
      } catch {
        body = payload
      }
    } else if (typeof payload?.text === 'string') {
      body = payload.text
    }
    if (!body || body.length > 1_000_000) return
    receiveSharedText(body)
  }
  useNativeActions(
    { newNote: () => createNote(), sharedText: receiveSharedText, openedFile: receiveOpenedFile },
    !blocked,
  )
  function updateBody(body) {
    if (!active || blocked) return
    commit(updateMobileNote(current.current, active.id, body))
    if (editor.current && editing)
      dispatch({ type: 'position', position: { cursor: editor.current.state.selection.main.head } })
  }
  function applyCover(image, imported) {
    const next = blocked ? null : applyNoteCover(current.current, layer?.id, image, imported)
    if (!next) {
      toast.error(t('cover.noteUnavailable'))
      return
    }
    if (next !== current.current) commit(next)
    back()
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
    const parts = wikiParts(target)
    const note = parts.name ? findNote(current.current.notes, target) : active
    if (note) {
      let targetLine = null
      if (parts.heading) {
        const lines = note.body.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (
            lines[i]
              .replace(/^#{1,6}\s+/, '')
              .trim()
              .toLocaleLowerCase() === parts.heading.toLocaleLowerCase()
          ) {
            targetLine = i + 1
            break
          }
        }
      }
      if (active && note.id === active.id) {
        if (targetLine) {
          content.current
            ?.querySelector(`[data-source-line="${targetLine}"]`)
            ?.scrollIntoView({ block: 'start' })
        }
        return
      }
      if (targetLine) pendingHeadingLine.current = targetLine
      openNote(note.id, false)
      return
    }
    if (!parts.name) return
    toast(t('wiki.create', { name: parts.name }), {
      duration: 8000,
      action: {
        label: t('wiki.createConfirm'),
        onClick: () => {
          if (!blocked) createNote(parts.name)
        },
      },
    })
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
  function emptyTrash() {
    if (!current.current.trash.length) return
    setTrashEmpty(true)
    dispatch({ type: 'layer', route: { name: 'dialog' } })
  }
  function confirmEmptyTrash() {
    if (blocked) return
    commit(
      current.current.trash.reduce(
        (document, entry) => purgeFromTrash(document, entry.note.id),
        current.current,
      ),
    )
    setTrashEmpty(false)
    back()
  }
  function togglePin(id) {
    commit(togglePinnedNote(current.current, id))
  }
  function pinNote(id) {
    togglePin(id)
    back()
  }
  const noteSort = prefs.noteSort === 'alphabetical' ? 'alphabetical' : 'recent'
  const groups = Array.isArray(data.groups) ? data.groups : []
  const groupOf = (note) => (groups.includes(note.group) ? note.group : undefined)
  const results = data.notes
    .map((note, index) => ({ note, index, result: noteSearchResult(note, query) }))
    .filter(({ result }) => !query.trim() || result.titleMatches.length || result.matches.length)
    .sort((a, b) => {
      if (query.trim()) {
        return (
          Number(Boolean(b.result.titleMatches.length)) -
            Number(Boolean(a.result.titleMatches.length)) || a.index - b.index
        )
      }
      const pinDiff =
        Number(data.pinnedIds?.includes(b.note.id) ?? false) -
        Number(data.pinnedIds?.includes(a.note.id) ?? false)
      if (pinDiff) return pinDiff
      if (noteSort === 'alphabetical') {
        return (
          displayName(a.note.name).localeCompare(displayName(b.note.name), undefined, {
            sensitivity: 'base',
          }) || a.index - b.index
        )
      }
      return (
        (recentNotes.includes(a.note.id) ? recentNotes.indexOf(a.note.id) : Infinity) -
          (recentNotes.includes(b.note.id) ? recentNotes.indexOf(b.note.id) : Infinity) ||
        a.index - b.index
      )
    })
  const looseResults = results.filter(({ note }) => !groupOf(note))
  const groupedResults = groups
    .map((name) => ({ name, items: results.filter(({ note }) => groupOf(note) === name) }))
    .filter(({ items }) => !query.trim() || items.length > 0)
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
            guide: 'menu.welcome',
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
  // Blocked storage keeps the unreadable payload so the user can take it away before
  // replacing it. The action is explicit and never runs on its own.
  async function downloadDamaged() {
    try {
      const status = await saveTextFile('sloth-note-damaged.json', 'application/json', damaged)
      if (status === 'saved' || status === 'download') toast.success(t('mobile.damagedSaved'))
    } catch {
      toast.error(t('mobile.downloadDamagedFailed'))
    }
  }
  async function replaceDamaged() {
    setReplaceBusy(true)
    try {
      const failure = await persistence.save(current.current)
      store.setError(failure)
      if (!failure) {
        store.setBlocked(false)
        setReplaceConfirm(false)
        toast.success(t('mobile.storageReplaced'))
      }
    } catch (cause) {
      store.setError(friendlyError(cause))
    } finally {
      setReplaceBusy(false)
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
          {damaged !== null && (
            <button onClick={downloadDamaged}>{t('mobile.downloadDamaged')}</button>
          )}
          {replaceConfirm ? (
            <>
              <p>{t('mobile.replaceStorageConfirm')}</p>
              <button disabled={replaceBusy} onClick={() => setReplaceConfirm(false)}>
                {t('dialog.cancel')}
              </button>
              <button className="danger" disabled={replaceBusy} onClick={replaceDamaged}>
                {t('mobile.replaceStorageConfirmAction')}
              </button>
            </>
          ) : (
            <button disabled={replaceBusy} onClick={() => setReplaceConfirm(true)}>
              {t('mobile.replaceStorage')}
            </button>
          )}
        </div>
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
      style={{
        '--editor-size': `${prefs.fontSize}px`,
        '--content-width':
          prefs.documentWidth === 'full' ? '100%' : `${prefs.contentWidth || 760}px`,
      }}
    >
      <header
        className="mobile-header"
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return
          if (event.target.closest('button, input, a')) return
          headerGesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // Ignore when pointer capture is unavailable (e.g. synthetic events).
          }
        }}
        onPointerUp={(event) => {
          const start = headerGesture.current
          headerGesture.current = null
          if (!start || start.id !== event.pointerId) return
          const selection = window.getSelection?.()
          const hasSelection = Boolean(selection && !selection.isCollapsed)
          const gesture = classifyHeaderGesture({
            startX: start.x,
            startY: start.y,
            endX: event.clientX,
            endY: event.clientY,
            viewportWidth: window.innerWidth,
            canSwitchNotes: route.name === 'note' && Boolean(active),
            hasSelection,
          })
          if (gesture === 'commands') {
            dispatch({ type: 'layer', route: { name: 'commands', prefix: '' } })
          } else if (gesture === 'next' || gesture === 'prev') {
            const deckIds =
              data.openIds.length >= 2 ? data.openIds : data.notes.map((item) => item.id)
            const targetId = adjacentOpenNoteId(deckIds, active?.id, gesture)
            if (targetId) {
              triggerHaptic('heading')
              openNote(targetId)
            }
          }
        }}
        onPointerCancel={() => {
          headerGesture.current = null
        }}
      >
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
        {root && route.name === 'notes' && (
          <>
            <button
              className="mobile-icon"
              aria-label={t(searchVisible ? 'mobile.closeSearch' : 'mobile.search')}
              title={t(searchVisible ? 'mobile.closeSearch' : 'mobile.search')}
              aria-expanded={searchVisible}
              onClick={() => {
                if (searchVisible) {
                  searchNotes('')
                  setSearchOpen(false)
                  setSearchFocused(false)
                } else setSearchOpen(true)
              }}
            >
              {searchVisible ? <X size={22} /> : <Search size={22} />}
            </button>
            <button
              className="mobile-icon"
              aria-label={t('library.sort')}
              title={t(
                noteSort === 'alphabetical' ? 'library.sortAlphabetical' : 'library.sortRecent',
              )}
              aria-pressed={noteSort === 'alphabetical'}
              onClick={() =>
                updatePrefs({ noteSort: noteSort === 'alphabetical' ? 'recent' : 'alphabetical' })
              }
            >
              <ArrowUpDown size={20} />
            </button>
            <button
              className="mobile-icon"
              disabled={blocked}
              aria-label={t('menu.newNote')}
              title={t('menu.newNote')}
              onClick={() => createNote()}
            >
              <FilePlus size={22} />
            </button>
          </>
        )}
        {root && route.name === 'tasks' && (
          <button
            className="mobile-icon"
            aria-label={t(showDone ? 'tasks.hideDone' : 'tasks.showDone')}
            title={t(showDone ? 'tasks.hideDone' : 'tasks.showDone')}
            aria-pressed={showDone}
            onClick={() => setShowDone(!showDone)}
          >
            <CheckCheck size={22} />
          </button>
        )}
        {!active && !editing && (
          <button
            className="mobile-icon"
            aria-label={t('mobile.commandsTitle')}
            title={t('mobile.commandsTitle')}
            onClick={() => dispatch({ type: 'layer', route: { name: 'commands', prefix: '' } })}
          >
            <Zap size={20} aria-hidden="true" />
          </button>
        )}
        {active && !(editing && sourceMode) && (
          <DocumentOutline
            key={active.id}
            className="mobile-outline"
            iconSize={22}
            closeOnNavigate
            body={active.body}
            onNavigate={(anchor, line) => {
              const view = editor.current
              if (editing && view) {
                view.dispatch({
                  selection: { anchor },
                  effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 16 }),
                })
                view.focus()
                return
              }
              content.current
                ?.querySelector(`[data-source-line="${line}"]`)
                ?.scrollIntoView({ block: 'start' })
            }}
          />
        )}
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
            aria-label={t('find.label')}
            title={t('find.label')}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setFindOpen((open) => !open)}
          >
            <ScanSearch size={20} aria-hidden="true" />
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
        {active && !editing && (boardView || isTaskNote(active.body)) && (
          <button
            className="mobile-icon"
            aria-label={t(boardView ? 'mobile.boardOff' : 'mobile.boardOn')}
            title={t(boardView ? 'mobile.boardOff' : 'mobile.boardOn')}
            aria-pressed={boardView}
            onClick={() => setBoardView(active.id, !boardView)}
          >
            {boardView ? <FileText size={22} /> : <Columns3 size={22} />}
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
      {error && (
        <div className="mobile-error" role="alert">
          <p>
            {t('mobile.saveFailed')} {error}
          </p>
          <div className="mobile-error-actions">
            <button onClick={() => writer.current.write(current.current)}>
              {t('mobile.retry')}
            </button>
            <button onClick={exportBackup}>{t('menu.backupDownload')}</button>
          </div>
        </div>
      )}
      {warning && (
        <div className="mobile-error" role="alert">
          <p>{warning}</p>
        </div>
      )}
      {root && route.name === 'notes' && searchVisible && (
        <label className="mobile-search">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            autoFocus={searchOpen && !query}
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
      {root &&
        route.name === 'notes' &&
        searchVisible &&
        searchFocused &&
        !query &&
        recentSearches.length > 0 && (
          <div className="mobile-recent-searches" aria-label={t('mobile.recentSearches')}>
            {recentSearches.map((term) => (
              <button key={term} onClick={() => searchNotes(term)}>
                <Search size={14} aria-hidden="true" />
                {term}
              </button>
            ))}
          </div>
        )}
      {findOpen && active && editing && (
        <EditorFind
          key={`${active.id}:edit:${findInitialQuery}`}
          view={editor.current}
          body={active.body}
          initialQuery={findInitialQuery}
          onClose={() => {
            setFindOpen(false)
            setFindInitialQuery('')
          }}
        />
      )}
      {findOpen && active && !editing && (
        <ReadingFind
          key={`${active.id}:${findInitialQuery}`}
          container={content}
          version={active.body}
          initialQuery={findInitialQuery}
          onClose={() => {
            setFindOpen(false)
            setFindInitialQuery('')
          }}
        />
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
            {!query.trim() && <GuideLibrary onOpen={openGuide} />}
            {(() => {
              const renderNoteRow = ({ note, result }) => {
                const pinned = Boolean(data.pinnedIds?.includes(note.id))
                return (
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
                          if (result.matches.length && query.trim()) {
                            setFindInitialQuery(query.trim())
                            setFindOpen(true)
                          }
                        }}
                      >
                        <span className="mobile-note-title">
                          {pinned && <Pin size={14} aria-label={t('mobile.pinned')} />}
                          {displayName(note.name)}
                          {result.matches.length > 0 && (
                            <span className="mobile-match-count">
                              {t(
                                result.matches.length === 1
                                  ? 'mobile.matchCount.one'
                                  : 'mobile.matchCount.other',
                                { count: result.matches.length },
                              )}
                            </span>
                          )}
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
                        className="mobile-icon mobile-pin"
                        aria-label={t(pinned ? 'mobile.unpin' : 'mobile.pin')}
                        title={t(pinned ? 'mobile.unpin' : 'mobile.pin')}
                        aria-pressed={pinned}
                        disabled={blocked}
                        onClick={() => togglePin(note.id)}
                      >
                        <Pin size={20} />
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
                )
              }
              const pinnedLoose = query.trim()
                ? []
                : looseResults.filter(({ note }) => data.pinnedIds?.includes(note.id))
              const otherLoose = query.trim()
                ? looseResults
                : looseResults.filter(({ note }) => !data.pinnedIds?.includes(note.id))
              return (
                <>
                  {pinnedLoose.length > 0 && (
                    <>
                      <h3 className="mobile-notes-section">
                        <Pin size={14} aria-hidden="true" />
                        {t('mobile.pinnedSection')} <span>{pinnedLoose.length}</span>
                      </h3>
                      {pinnedLoose.map(renderNoteRow)}
                    </>
                  )}
                  {groupedResults.map(({ name, items }) => (
                    <details key={name} className="mobile-group" open>
                      <summary>
                        <Folder size={16} aria-hidden="true" />
                        <span className="mobile-group-name">{name}</span>
                        <span className="mobile-group-count">{items.length}</span>
                      </summary>
                      <div className="mobile-group-list">{items.map(renderNoteRow)}</div>
                    </details>
                  ))}
                  {pinnedLoose.length > 0 && otherLoose.length > 0 && (
                    <h3 className="mobile-notes-section">
                      {t('mobile.otherNotes')} <span>{otherLoose.length}</span>
                    </h3>
                  )}
                  {otherLoose.map(renderNoteRow)}
                </>
              )
            })()}
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
                starters
                onTemplateMode={(mode) => {
                  if (mode !== 'board') return
                  // The task template marks the note as a task note (ADR 0033).
                  const note = current.current.notes.find((item) => item.id === active.id)
                  const next = note && makeTaskNote(note.body, { language: currentLanguage() })
                  if (next && next !== note.body) updateBody(next)
                  setBoardView(active.id, true)
                }}
                sourceMode={sourceMode}
                outline={false}
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
            ) : boardView ? (
              <div className="board-wrap">
                <TaskBoard
                  key={active.id}
                  compact
                  readOnly={blocked}
                  body={active.body}
                  onChange={blocked ? () => {} : updateBody}
                />
              </div>
            ) : (
              <>
                <NoteCoverBanner
                  body={active.body}
                  onChange={
                    !blocked && !active.external
                      ? () => dispatch({ type: 'layer', route: { name: 'cover', id: active.id } })
                      : undefined
                  }
                />
                <PropertiesDock
                  body={active.body}
                  readOnly={blocked || Boolean(active.external)}
                  onApply={updateBody}
                />
                <Markdown
                  wrapLines={prefs.wrapLines !== false}
                  wrapPage={pageWrap}
                  text={active.body}
                  modifiedAt={active.modifiedAt}
                  createdAt={active.createdAt}
                  notes={data.notes}
                  onChange={blocked ? undefined : updateBody}
                  onOpenWiki={openWiki}
                  onCopy={copy}
                  focusableTables
                  folds={
                    fold.id === active.id && fold.body === active.body ? fold.lines : undefined
                  }
                  onToggleFold={(line) => {
                    const same = fold.id === active.id && fold.body === active.body
                    const lines = new Set(same ? fold.lines : [])
                    if (!lines.delete(line)) lines.add(line)
                    setFold({ id: active.id, body: active.body, lines })
                  }}
                />
              </>
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
                triggerHaptic('task-done')
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
        {route.name === 'images' &&
          (() => {
            const allImages = libraryImages(data)
            const visibleImages =
              imagesFilter === 'unused'
                ? allImages.filter((image) => image.noteIds.length === 0)
                : allImages
            return (
              <section className="mobile-images" aria-label={t('images.title')}>
                <div className="mobile-images-toolbar">
                  <div
                    className="mobile-images-filters"
                    role="group"
                    aria-label={t('images.title')}
                  >
                    <button
                      type="button"
                      aria-pressed={imagesFilter === 'all'}
                      onClick={() => setImagesFilter('all')}
                    >
                      {t('mobile.imagesAll')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={imagesFilter === 'unused'}
                      onClick={() => setImagesFilter('unused')}
                    >
                      {t('mobile.imagesUnused')}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={imageBusy || blocked}
                    onClick={() => cameraInput.current?.click()}
                  >
                    {t('mobile.camera')}
                  </button>
                  <input
                    ref={cameraInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file || imageBusy || blocked) return
                      setImageBusy(true)
                      try {
                        const src = await importImage(file, persistence.invoke)
                        setPendingInsertImage({ name: file.name, src })
                        dispatch({ type: 'layer', route: { name: 'image-insert' } })
                      } catch (cause) {
                        toast.error(t('images.importFailed', { error: friendlyError(cause) }))
                      } finally {
                        setImageBusy(false)
                      }
                    }}
                  />
                </div>
                {visibleImages.map((image) => (
                  <figure key={image.src}>
                    <button
                      type="button"
                      className="mobile-image-card"
                      aria-label={image.name}
                      onClick={() => {
                        setSelectedImage(image)
                        dispatch({ type: 'layer', route: { name: 'image-detail' } })
                      }}
                    >
                      <ImageThumbnail src={image.src} alt={image.name} />
                    </button>
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
                {!visibleImages.length && (
                  <div className="mobile-empty">
                    <ImageIcon size={32} aria-hidden="true" />
                    <p>{t('mobile.noImages')}</p>
                  </div>
                )}
              </section>
            )
          })()}
        {route.name === 'trash' && (
          <section className="mobile-trash" aria-label={t('trash.title')}>
            {data.trash.length > 0 && (
              <button className="mobile-trash-empty" disabled={blocked} onClick={emptyTrash}>
                {t('trash.emptyAll')}
              </button>
            )}
            <TrashLibrary
              trash={data.trash}
              query=""
              onRestore={(id) => commit(restoreFromTrash(current.current, id))}
              onPurge={(id) => {
                setTrashEmpty(false)
                setPurgeId(id)
                dispatch({ type: 'layer', route: { name: 'dialog', id } })
              }}
            />
          </section>
        )}
        {route.name === 'settings' && (
          <section className="mobile-settings" aria-label={t('menu.settings')}>
            <h2>{t('settings.appearance')}</h2>
            <div className="settings-card">
              <div className="settings-row stacked">
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
              </div>
              <div className="settings-row stacked">
                <div className="settings-row-head">
                  <label htmlFor="mobile-font-size">{t('settings.fontSize')}</label>
                  <output htmlFor="mobile-font-size">{prefs.fontSize}px</output>
                </div>
                <input
                  id="mobile-font-size"
                  type="range"
                  min={FONT_SIZE.min}
                  max={FONT_SIZE.max}
                  value={prefs.fontSize}
                  onChange={(event) => updatePrefs({ fontSize: Number(event.target.value) })}
                />
              </div>
              <div className="settings-row stacked">
                <span className="settings-row-title">{t('settings.contentWidth')}</span>
                <DocumentWidthPresets prefs={prefs} onChange={updatePrefs} />
              </div>
            </div>
            <h2>{t('settings.editor')}</h2>
            <div className="settings-card">
              <EditorToggleSettings prefs={prefs} onChange={updatePrefs} variant="mobile" />
            </div>
            <h2>{t('settings.data')}</h2>
            <p className="settings-note">{t('mobile.backupDetails')}</p>
            <div className="settings-card">
              <button
                className="settings-row settings-action"
                disabled={Boolean(transferBusy)}
                onClick={exportBackup}
              >
                <FileOutput size={20} aria-hidden="true" />
                {t('mobile.backupSave')}
              </button>
              <button
                className="settings-row settings-action"
                disabled={Boolean(transferBusy)}
                onClick={() => backupInput.current?.click()}
              >
                <FileInput size={20} aria-hidden="true" />
                {t('mobile.backupRestore')}
              </button>
            </div>
            <input
              ref={backupInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => chooseBackup(event.target.files?.[0])}
            />
            <h2>{t('settings.sync')}</h2>
            <div className="settings-card settings-sync">
              <SyncPanel sync={sync} />
            </div>
            <h2>{t('history.title')}</h2>
            <div className="settings-card">
              <HistoryPanel
                prefs={prefs}
                note={active}
                history={store.noteHistory}
                onChange={updatePrefs}
                onRestore={(body) => {
                  if (!active || blocked) return
                  updateBody(body)
                  toast.success(t('history.restored'))
                }}
              />
            </div>
            <h2>{t('settings.about')}</h2>
            <div className="settings-card">
              <button
                className="settings-row settings-action"
                onClick={() => dispatch({ type: 'push', route: { name: 'changelog' } })}
              >
                <NotebookPen size={20} aria-hidden="true" />
                {t('settings.changelog')}
              </button>
              <button className="settings-row settings-action" onClick={() => openGuide()}>
                <FileText size={20} aria-hidden="true" />
                {t('menu.welcome')}
              </button>
              <div className="settings-row stacked">
                <AboutPanel />
              </div>
            </div>
          </section>
        )}
        {route.name === 'changelog' && <ChangelogPanel />}
        {route.name === 'guide' && (
          <Markdown
            text={guideDocument(route.id)}
            onCopy={copy}
            onOpenWiki={(target) => {
              const next = guideTarget(target)
              if (next && next !== route.id) openGuide(next)
            }}
          />
        )}
      </div>
      {editing && !sourceMode && keyboardOpen && (
        <FormattingBar
          view={editor.current}
          onInsert={() => dispatch({ type: 'layer', route: { name: 'insert' } })}
          onHideKeyboard={() => {
            document.activeElement?.blur?.()
            window.SlothShare?.hideKeyboard?.()
          }}
        />
      )}
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
          <button
            type="button"
            aria-label={t('mobile.undo')}
            title={t('mobile.undo')}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              const view = editor.current
              if (!view || view.composing || view.compositionStarted) return
              undo(view)
              view.focus()
            }}
          >
            <Undo2 size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t('mobile.redo')}
            title={t('mobile.redo')}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              const view = editor.current
              if (!view || view.composing || view.compositionStarted) return
              redo(view)
              view.focus()
            }}
          >
            <Redo2 size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t('mobile.hideKeyboard')}
            title={t('mobile.hideKeyboard')}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              document.activeElement?.blur?.()
              window.SlothShare?.hideKeyboard?.()
            }}
          >
            <KeyboardOff size={20} aria-hidden="true" />
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
            aria-label={t(label)}
            title={t(label)}
            aria-current={route.name === name ? 'page' : undefined}
            onClick={() => {
              document.activeElement?.blur?.()
              dispatch({ type: 'tab', name })
            }}
          >
            <Icon size={22} aria-hidden="true" />
          </button>
        ))}
        <button
          aria-label={t('mobile.more')}
          aria-haspopup="dialog"
          aria-expanded={Boolean(layer?.name === 'sheet' && !layer.id)}
          onClick={() => dispatch({ type: 'layer', route: { name: 'sheet' } })}
        >
          <Menu size={22} aria-hidden="true" />
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
              layer.name === 'insert'
                ? t('mobile.insert')
                : layer.name === 'commands'
                  ? t('mobile.commandsTitle')
                  : layer.name === 'cover'
                    ? t('cover.title')
                    : layer.name === 'group'
                      ? t('mobile.moveToGroup')
                      : layer.name === 'info'
                        ? t('mobile.info')
                        : layer.name === 'sections'
                          ? t('mobile.moveSection')
                          : actionsNote
                            ? t('mobile.noteActions', { name: displayName(actionsNote.name) })
                            : t('mobile.more')
            }
          >
            <div
              className="mobile-sheet-heading"
              data-sheet-drag
              onPointerDown={(event) => {
                if (event.target.closest('button, input')) return
                if (
                  document.documentElement.dataset.keyboard === 'open' ||
                  (dialog.current && dialog.current.scrollTop > 0)
                )
                  return
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
                {layer.name === 'insert'
                  ? t('mobile.insert')
                  : layer.name === 'commands'
                    ? t('mobile.commandsTitle')
                    : layer.name === 'cover'
                      ? t('cover.title')
                      : layer.name === 'image-detail'
                        ? selectedImage?.name || t('images.title')
                        : layer.name === 'image-insert'
                          ? t('mobile.insertInNote')
                          : actionsNote
                            ? displayName(actionsNote.name)
                            : 'Sloth Note'}
              </h2>
              <button className="mobile-icon" aria-label={t('dialog.close')} onClick={back}>
                <X size={22} />
              </button>
            </div>
            {layer.name === 'image-detail' && selectedImage ? (
              <div className="mobile-image-detail">
                <ImageThumbnail src={selectedImage.src} alt={selectedImage.name} />
                {selectedImage.noteIds.length > 0 && (
                  <div className="mobile-image-notes">
                    <p>{t('mobile.imageNotes')}</p>
                    {selectedImage.noteIds.map((id) => {
                      const note = data.notes.find((item) => item.id === id)
                      return (
                        note && (
                          <button
                            key={id}
                            onClick={() => {
                              back()
                              openNote(id)
                            }}
                          >
                            {displayName(note.name)}
                          </button>
                        )
                      )
                    })}
                  </div>
                )}
                <button
                  onClick={() => {
                    setPendingInsertImage({ name: selectedImage.name, src: selectedImage.src })
                    dispatch({ type: 'layer', route: { name: 'image-insert' } })
                  }}
                >
                  {t('mobile.insertAgain')}
                </button>
                <button
                  className="danger"
                  disabled={blocked}
                  onClick={() => {
                    commit(removeDocumentImage(current.current, selectedImage.src))
                    setSelectedImage(null)
                    back()
                    toast.success(t('mobile.imageDeleted'))
                  }}
                >
                  {t('trash.purge')}
                </button>
              </div>
            ) : layer.name === 'image-insert' && pendingInsertImage ? (
              <div className="mobile-image-insert-list">
                <button
                  disabled={blocked}
                  onClick={() => {
                    const md = markdownImage(pendingInsertImage.name, pendingInsertImage.src)
                    const next = newMobileNote(current.current)
                    const created = next.notes.find((item) => item.id === next.activeId)
                    if (created) created.body = `${created.body}\n\n${md}\n`
                    commit(next)
                    setPendingInsertImage(null)
                    dispatch({ type: 'replace', route: { name: 'note', id: next.activeId } })
                  }}
                >
                  {t('menu.newNote')}
                </button>
                {data.notes.map((note) => (
                  <button
                    key={note.id}
                    disabled={blocked}
                    onClick={() => {
                      const md = markdownImage(pendingInsertImage.name, pendingInsertImage.src)
                      const next = {
                        ...current.current,
                        notes: current.current.notes.map((item) =>
                          item.id === note.id
                            ? { ...item, body: `${item.body.trimEnd()}\n\n${md}\n` }
                            : item,
                        ),
                      }
                      commit(next)
                      setPendingInsertImage(null)
                      setSelectedImage(null)
                      dispatch({ type: 'tab', name: 'images' })
                      dispatch({ type: 'push', route: { name: 'note', id: note.id } })
                    }}
                  >
                    {displayName(note.name)}
                  </button>
                ))}
              </div>
            ) : layer.name === 'insert' ? (
              <EditingSheet
                view={editor.current}
                notes={data.notes}
                modifiedAt={active?.modifiedAt}
                createdAt={active?.createdAt}
                onClose={back}
                onImage={() => {
                  imagePoint.current = editor.current.state.selection.main
                  back()
                  imageInput.current?.click()
                }}
              />
            ) : layer.name === 'commands' ? (
              <CommandSheet
                initialPrefix={layer.prefix ?? ''}
                notes={data.notes}
                active={active}
                commands={[
                  {
                    id: 'newNote',
                    label: t('menu.newNote'),
                    icon: <FilePlus size={18} aria-hidden="true" />,
                    run: () => createNote(),
                  },
                  ...(active
                    ? [
                        {
                          id: 'findInNote',
                          label: t('mobile.readingFind'),
                          icon: <ScanSearch size={18} aria-hidden="true" />,
                          run: () => {
                            setEditingId(null)
                            setFindInitialQuery('')
                            setFindOpen(true)
                            back()
                          },
                        },
                        {
                          id: 'toggleCodeMode',
                          label: t(sourceMode ? 'mobile.visualMode' : 'mobile.codeMode'),
                          icon: sourceMode ? (
                            <FileText size={18} aria-hidden="true" />
                          ) : (
                            <Code2 size={18} aria-hidden="true" />
                          ),
                          run: () => {
                            const nextCode = !sourceMode
                            setNoteMode(active.id, nextCode)
                            if (nextCode) setEditingId(active.id)
                            back()
                          },
                        },
                        {
                          id: 'pin',
                          label: t(
                            data.pinnedIds?.includes(active.id) ? 'mobile.unpin' : 'mobile.pin',
                          ),
                          icon: <Pin size={18} aria-hidden="true" />,
                          run: () => pinNote(active.id),
                        },
                        {
                          id: 'wrapPage',
                          label: t('menu.wrapPage'),
                          icon: <WrapText size={18} aria-hidden="true" />,
                          run: () => {
                            updatePrefs(toggleNoteWrap(prefs, active.id))
                            back()
                          },
                        },
                      ]
                    : []),
                  {
                    id: 'settings',
                    label: t('menu.settings'),
                    icon: <Settings size={18} aria-hidden="true" />,
                    run: () => dispatch({ type: 'push', route: { name: 'settings' } }),
                  },
                  {
                    id: 'trash',
                    label: t('menu.trash'),
                    icon: <Trash2 size={18} aria-hidden="true" />,
                    run: () => dispatch({ type: 'push', route: { name: 'trash' } }),
                  },
                ]}
                onOpenNote={(id, matchQuery) => {
                  openNote(id)
                  if (matchQuery) {
                    setFindInitialQuery(matchQuery)
                    setFindOpen(true)
                  }
                }}
                onCreateNote={(name) => createNote(name)}
                onRunCommand={(item) => item.run()}
                onJumpHeading={(item) => {
                  if (!active || active.id !== item.noteId) {
                    pendingHeadingLine.current = item.line
                    openNote(item.noteId)
                    return
                  }
                  back()
                  if (editing && editor.current) {
                    const doc = editor.current.state.doc
                    const anchor = doc.line(Math.min(item.line, doc.lines)).from
                    editor.current.dispatch({
                      selection: { anchor },
                      effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 16 }),
                    })
                    editor.current.focus()
                  } else {
                    content.current
                      ?.querySelector(`[data-source-line="${item.line}"]`)
                      ?.scrollIntoView({ block: 'start' })
                  }
                }}
                onClose={back}
              />
            ) : layer.name === 'info' && active ? (
              (() => {
                const stats = textStatistics(active.body)
                return (
                  <dl className="mobile-info-list">
                    <div>
                      <dt>{t('mobile.words')}</dt>
                      <dd>{stats.words}</dd>
                    </div>
                    <div>
                      <dt>{t('mobile.characters')}</dt>
                      <dd>{stats.characters}</dd>
                    </div>
                    <div>
                      <dt>{t('mobile.charactersNoSpaces')}</dt>
                      <dd>{stats.charactersNoSpaces}</dd>
                    </div>
                    <div>
                      <dt>{t('mobile.lines')}</dt>
                      <dd>{stats.lines}</dd>
                    </div>
                  </dl>
                )
              })()
            ) : layer.name === 'sections' && active ? (
              (() => {
                const sections = headingSections(active.body).filter((h) => h.level >= 1)
                if (!sections.length)
                  return <p className="mobile-empty">{t('mobile.noSections')}</p>
                return (
                  <div className="mobile-sections-list">
                    {sections.map((section) => {
                      const text = active.body.split('\n')[section.line - 1]?.replace(/^#+\s*/, '')
                      return (
                        <div key={section.line} className="mobile-section-row">
                          <span className="mobile-section-title">{text}</span>
                          <button
                            type="button"
                            className="mobile-icon"
                            aria-label={`${t('mobile.moveUp')}: ${text}`}
                            onClick={() => moveNoteSection(section.line, -1)}
                          >
                            <ArrowUp size={18} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="mobile-icon"
                            aria-label={`${t('mobile.moveDown')}: ${text}`}
                            onClick={() => moveNoteSection(section.line, 1)}
                          >
                            <ArrowDown size={18} aria-hidden="true" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })()
            ) : layer.name === 'cover' && actionsNote ? (
              <CoverPicker
                images={libraryImages(data)}
                selected={noteCover(actionsNote.body)?.url}
                invoke={persistence.invoke}
                onApply={applyCover}
              />
            ) : layer.name === 'group' && actionsNote ? (
              <>
                <button
                  aria-pressed={!groupOf(actionsNote)}
                  onClick={() => {
                    commit(setNoteGroupDocument(current.current, actionsNote.id, undefined))
                    back()
                  }}
                >
                  <NotebookText size={20} aria-hidden="true" />
                  {t('mobile.noGroup')}
                </button>
                {groups.map((name) => (
                  <button
                    key={name}
                    aria-pressed={groupOf(actionsNote) === name}
                    onClick={() => {
                      commit(setNoteGroupDocument(current.current, actionsNote.id, name))
                      back()
                    }}
                  >
                    <Folder size={20} aria-hidden="true" />
                    {name}
                  </button>
                ))}
              </>
            ) : layer.name === 'dialog' && route.name === 'settings' && backupCandidate ? (
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
            ) : layer.name === 'dialog' && route.name === 'trash' && trashEmpty ? (
              <>
                <p>{t('trash.emptyConfirm', { count: data.trash.length })}</p>
                <button
                  onClick={() => {
                    setTrashEmpty(false)
                    back()
                  }}
                >
                  {t('dialog.cancel')}
                </button>
                <button className="danger" disabled={blocked} onClick={confirmEmptyTrash}>
                  {t('trash.emptyAll')}
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
                {active && actionsNote.id === active.id && (
                  <>
                    <button
                      onClick={() =>
                        dispatch({
                          type: 'layer',
                          replace: true,
                          route: { name: 'commands', prefix: '' },
                        })
                      }
                    >
                      <Zap size={20} aria-hidden="true" />
                      {t('mobile.commandsTitle')}
                    </button>
                    <button
                      aria-pressed={boardView}
                      onClick={() => {
                        setBoardView(active.id, !boardView)
                        back()
                      }}
                    >
                      {boardView ? (
                        <FileText size={20} aria-hidden="true" />
                      ) : (
                        <Columns3 size={20} aria-hidden="true" />
                      )}
                      {t(boardView ? 'mobile.boardOff' : 'mobile.boardOn')}
                    </button>
                    <button
                      disabled={blocked}
                      onClick={() => {
                        const nextCode = !sourceMode
                        setNoteMode(active.id, nextCode)
                        if (nextCode) setEditingId(active.id)
                        back()
                      }}
                    >
                      {sourceMode ? <FileText size={20} /> : <Code2 size={20} />}
                      {t(sourceMode ? 'mobile.visualMode' : 'mobile.codeMode')}
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    updatePrefs(toggleNoteWrap(prefs, actionsNote.id))
                    back()
                  }}
                >
                  <WrapText size={20} />
                  {t('menu.wrapPage')}
                </button>
                <button
                  disabled={blocked || Boolean(actionsNote.external)}
                  onClick={() =>
                    dispatch({ type: 'layer', route: { name: 'cover', id: actionsNote.id } })
                  }
                >
                  <ImageIcon size={20} aria-hidden="true" />
                  {t('cover.title')}
                </button>
                {active &&
                  actionsNote.id === active.id &&
                  !frontmatterEnd(actionsNote.body) &&
                  !blocked &&
                  !actionsNote.external && (
                    <button
                      onClick={() => {
                        updateBody(`---\npropriedade: valor\n---\n${actionsNote.body}`)
                        back()
                      }}
                    >
                      <SlidersHorizontal size={20} aria-hidden="true" />
                      {t('menu.properties')}
                    </button>
                  )}
                {!actionsNote.external && (
                  <button
                    disabled={blocked}
                    onClick={() => {
                      const templateNotes = { ...prefs.templateNotes }
                      const marked = Boolean(templateNotes[actionsNote.id])
                      if (marked) delete templateNotes[actionsNote.id]
                      else templateNotes[actionsNote.id] = true
                      updatePrefs({ templateNotes })
                      toast(t(marked ? 'templates.removedToast' : 'templates.addedToast'))
                      back()
                    }}
                  >
                    <FileText size={20} aria-hidden="true" />
                    {t(
                      prefs.templateNotes?.[actionsNote.id]
                        ? 'menu.removeTemplate'
                        : 'menu.useAsTemplate',
                    )}
                  </button>
                )}
                <button
                  data-rename-trigger
                  disabled={blocked || Boolean(actionsNote.external)}
                  onClick={() => {
                    setRename(displayName(actionsNote.name))
                    setRenameError('')
                    dispatch({ type: 'layer', route: { name: 'dialog', id: actionsNote.id } })
                  }}
                >
                  <Pencil size={20} />
                  {t('menu.rename')}
                </button>
                {active && actionsNote.id === active.id && (
                  <>
                    <button onClick={() => dispatch({ type: 'layer', route: { name: 'info' } })}>
                      <Info size={20} aria-hidden="true" />
                      {t('mobile.info')}
                    </button>
                    <button
                      onClick={() => {
                        foldAllSections()
                        back()
                      }}
                    >
                      <ChevronsDownUp size={20} aria-hidden="true" />
                      {t('menu.foldAll')}
                    </button>
                    <button
                      onClick={() => {
                        unfoldAllSections()
                        back()
                      }}
                    >
                      <ChevronsUpDown size={20} aria-hidden="true" />
                      {t('menu.unfoldAll')}
                    </button>
                    <button
                      disabled={blocked}
                      onClick={() => dispatch({ type: 'layer', route: { name: 'sections' } })}
                    >
                      <ArrowUpDown size={20} aria-hidden="true" />
                      {t('mobile.moveSection')}
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setFindOpen(true)
                    back()
                  }}
                >
                  <ScanSearch size={20} />
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
                    <FileText size={20} />
                    {t('mobile.shareFile')}
                  </button>
                )}
                <button disabled={shareBusy} onClick={() => shareNote(actionsNote)}>
                  {window.SlothShare || navigator.share ? <Share2 size={20} /> : <Copy size={20} />}
                  {t(window.SlothShare || navigator.share ? 'mobile.share' : 'mobile.copyText')}
                </button>
                <button disabled={Boolean(transferBusy)} onClick={() => exportNote(actionsNote)}>
                  <FileOutput size={20} />
                  {t('menu.export')}
                </button>
                <p className="mobile-export-hint">{t('mobile.noteExportHint')}</p>
                {groups.length > 0 && (
                  <button
                    disabled={blocked}
                    onClick={() =>
                      dispatch({ type: 'layer', route: { name: 'group', id: actionsNote.id } })
                    }
                  >
                    <Folder size={20} aria-hidden="true" />
                    {t('mobile.moveToGroup')}
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
                <button onClick={() => noteInput.current?.click()}>
                  <FileInput size={20} />
                  {t('menu.import')}
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
                  <Settings size={20} />
                  {t('menu.settings')}
                </button>
                <button onClick={() => dispatch({ type: 'push', route: { name: 'changelog' } })}>
                  <NotebookPen size={20} />
                  {t('settings.changelog')}
                </button>
              </>
            )}
          </section>
        </div>
      )}
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length && imagePoint.current)
            void addMobileImages([...event.target.files], imagePoint.current)
          event.target.value = ''
        }}
      />
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
