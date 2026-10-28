import { pasteGesture } from './paste-intent.js'
import { quickOpenNotes } from './quick-open.js'
import { textStatistics } from './text-statistics.js'
import { ChangeSet } from '@codemirror/state'
import { documentChanges, mapSearchScope } from './search-scope.js'
import { SourceSearchHighlights } from './components/source-search-highlights.jsx'
import { clipboardImageFiles, readNativeClipboard } from './clipboard.js'
import { createMiddleClickPasteGuard } from './middle-click-paste.js'
import { createPasteIntentGuard } from './paste-intent.js'
import { listenNativeImageDrops, routeNativeImageDrop } from './native-image-drop.js'
import { ensureTitle, titlePosition, titleNavigationTarget } from './title.js'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'sonner'
import { createFullBackup, readBackupBundle, restoreBackupImages } from './backup.js'
import {
  findNote,
  wikiParts,
  noteReferences,
  renameWikiReferences,
  normalizeImageSource,
} from './markdown-model.js'
import { CONTENT_WIDTH, FONT_SIZE, contentWidth } from './storage.js'
import { WidthFeedback } from './components/width-feedback.jsx'
import { TrashLibrary } from './components/trash-library.jsx'
import { NoteList } from './components/note-list.jsx'
import { friendlyError } from './errors.js'
import { ToastButtons } from './components/toast-buttons.jsx'
import { CommandPalette } from './components/command-palette.jsx'
import { SettingsDialog } from './components/settings-dialog.jsx'
import { buildCommands } from './commands.js'
import { MainMenu } from './components/main-menu.jsx'
import { ShortcutButton, ShortcutHint } from './components/shortcut-button.jsx'
import { shortcutText } from './components/shortcut.jsx'
import { WindowControls, isMac } from './components/window-controls.jsx'
import { DisplayMenu, ThemeSwitch } from './components/display-menu.jsx'
import { TasksLibrary } from './components/tasks-library.jsx'
import { resolvedTasks } from './tasks.js'
import { displayName } from './note-title.js'
import { useTabs } from './components/tabs.jsx'
import { NoteViewport } from './components/note-viewport.jsx'
import { useNotesStore } from './hooks/use-notes-store.js'
import { useNoteActions } from './hooks/use-note-actions.js'
import { usePrefs } from './hooks/use-prefs.js'
import { ImageLibrary } from './components/image-library.jsx'
import { readNoteFile, splitDrop } from './note-drop.js'
import { externalNote, isExternalNote } from './external-notes.js'
import { appShortcut } from './shortcuts.js'
import { blockShortcut, formatShortcut, shortcutEdit } from './editor-shortcuts.js'
import { blockEdit } from './insert-block.js'
import { searchNote, replacementText } from './find.js'
import { setSearchHighlights, revealSearchMatch } from './editor/search.js'
import { headingFileName, nameFromHeading, uniqueName } from './notes.js'
import { openWorkspace } from './boot.js'
import { createAppPersistence } from './persistence-runtime.js'
import { VAULT_DISCONNECT, connectVault } from './persistence-vault.js'
import { VisualEditor } from './visual-editor.jsx'
import {
  ConfirmDialog,
  ConflictDialog,
  FindDialog,
  FolderDialog,
  ShortcutsDialog,
  PaletteDialog,
  PromptDialog,
  SyncConflictDialog,
} from './components/dialogs.jsx'
import { t } from './i18n.js'
import { wrapSelection } from './wrap-selection.js'
import { welcomeNote } from './welcome.js'
import { foldAll, unfoldAll } from './editor/folding.js'
import { continueBlock } from './continue-block.js'
import { applyChanges, listIndentChanges, mapPosition } from './list-indent.js'
import { moveListItems } from './list-move.js'
import { restoreWindowState } from './window-state.js'
import { protectPendingSaves } from './save-lifecycle.js'
import {
  importImage,
  noteImages,
  libraryImages,
  resolveImage,
  allNotes,
  clearImageCache,
  markdownImage,
  replaceDocumentImage,
  dataUrlBytes,
} from './images.js'
import {
  BookOpen,
  Code,
  Eye,
  PanelLeft,
  Plus,
  Menu,
  Search,
  Image as ImageIcon,
  ArrowLeft,
  ListChecks,
  NotebookText,
  Trash2,
  Minimize2,
} from 'lucide-react'
import { platform } from './platform.js'
import { MobileShell } from './mobile/mobile-shell.jsx'
import './styles.css'
import './ui.css'

function download(name, body, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const mac = isMac()
const SECTIONS = ['notes', 'tasks', 'images']
const SECTION_LABELS = {
  notes: ['menu.notes', NotebookText],
  tasks: ['tasks.title', ListChecks],
  images: ['images.title', ImageIcon],
}

function ModeIcon({ mode }) {
  const props = { className: 'mode-icon', 'aria-hidden': true }
  if (mode === 'visual') return <Eye {...props} />
  if (mode === 'source') return <Code {...props} />
  return <BookOpen {...props} />
}

function Opening({ failure }) {
  return (
    <main className="app boot">
      <p role={failure ? 'alert' : 'status'}>
        {failure ? t('app.openFailed', { failure }) : t('app.opening')}
      </p>
    </main>
  )
}

function App() {
  const [started, setStarted] = useState(null)
  const [failure, setFailure] = useState(null)
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
  }, [])
  if (failure) return <Opening failure={failure} />
  if (!started) return <Opening />
  return <Workspace persistence={started.persistence} loaded={started.loaded} />
}

function Workspace({ persistence, loaded }) {
  const [settingsSection, setSettingsSection] = useState('appearance')
  const [mode, setMode] = useState('visual')
  const [importError, setImportError] = useState('')
  const {
    data,
    current,
    commit,
    noteHistory,
    writer,
    error,
    setError,
    saving,
    blocked,
    setBlocked,
  } = useNotesStore({ persistence, loaded, mode, onHistoryWarning: setImportError })
  const [sidebarQuery, setSidebarQuery] = useState('')
  const sidebarSearchRef = useRef(null)
  const [sidebarSection, setSidebarSection] = useState('notes')
  const [showDoneTasks, setShowDoneTasks] = useState(false)
  const [diskImages, setDiskImages] = useState([])
  const [imageVersion, setImageVersion] = useState(0)
  const [imagesLoading, setImagesLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const imageInput = useRef(null)
  const imagePoint = useRef(null)
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [folderError, setFolderError] = useState('')
  const [folderOpen, setFolderOpen] = useState(false)
  const [asking, setAsking] = useState(null)
  const [syncConflicts, setSyncConflicts] = useState([])
  const [conflict, setConflict] = useState(null)
  const conflictRef = useRef(null)
  const conflictQueue = useRef([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedText, setSelectedText] = useState({ id: null, mode: null, text: '' })
  const [focusMode, setFocusMode] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [replacement, setReplacement] = useState('')
  const [findOptions, setFindOptions] = useState({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    preserveCase: false,
    selectionOnly: false,
    scope: null,
  })
  const damaged = useRef(loaded.raw)
  const search = useRef(null)
  const conflictFirst = useRef(null)
  const importInput = useRef(null)
  const backupInput = useRef(null)
  const backupBusy = useRef(false)
  const menuButton = useRef(null)
  const menuWrap = useRef(null)
  const menuFirst = useRef(null)
  const findInput = useRef(null)
  const replaceInput = useRef(null)
  const findNavigation = useRef(null)
  const pendingSearchChanges = useRef(null)
  const editorRef = useRef(null)
  const visualRef = useRef(null)
  const notePositions = useRef(new Map())
  const clipboardBusy = useRef(false)
  const clipboardFocusEpoch = useRef(0)
  const [pasteIntentGuard] = useState(createPasteIntentGuard)
  useEffect(() => {
    const cancelPendingPaste = () => {
      clipboardFocusEpoch.current++
      pasteIntentGuard.reset()
    }
    window.addEventListener('blur', cancelPendingPaste)
    window.addEventListener('focus', pasteIntentGuard.reset)
    document.addEventListener('visibilitychange', cancelPendingPaste)
    document.addEventListener('keydown', pasteIntentGuard.keyboard, true)
    document.addEventListener('contextmenu', pasteIntentGuard.contextMenu, true)
    document.addEventListener('pointerdown', pasteIntentGuard.reset, true)
    document.addEventListener('focusout', pasteIntentGuard.reset, true)
    // Use the native event: React's onBeforeInput is a text-input polyfill.
    document.addEventListener('beforeinput', pasteIntentGuard.beforeInput, true)
    return () => {
      window.removeEventListener('blur', cancelPendingPaste)
      window.removeEventListener('focus', pasteIntentGuard.reset)
      document.removeEventListener('visibilitychange', cancelPendingPaste)
      document.removeEventListener('keydown', pasteIntentGuard.keyboard, true)
      document.removeEventListener('contextmenu', pasteIntentGuard.contextMenu, true)
      document.removeEventListener('pointerdown', pasteIntentGuard.reset, true)
      document.removeEventListener('focusout', pasteIntentGuard.reset, true)
      document.removeEventListener('beforeinput', pasteIntentGuard.beforeInput, true)
    }
  }, [pasteIntentGuard])
  const [middleClickPasteGuard] = useState(createMiddleClickPasteGuard)
  const returnFocus = useRef(null)
  const active = data.notes.find((note) => note.id === data.activeId) ?? null
  const choices = useMemo(
    () => (palette ? quickOpenNotes(data.notes, data.openIds, query) : []),
    [palette, data.notes, data.openIds, query],
  )
  const { prefs, updatePrefs } = usePrefs({ data, current, commit })
  const {
    previewId,
    setPreviewId,
    focusEditor,
    openNote,
    previewNote,
    keepNote,
    createNote,
    closeTab,
    reopenTab,
    selectAdjacentTab,
    renameNote,
    deleteNote,
    restoreNote,
    purgeNote,
    emptyTrash,
    toggleNoteTask,
    jumpToTask,
  } = useNoteActions({
    data,
    current,
    commit,
    noteHistory,
    mode,
    setMode,
    palette,
    closePalette,
    active,
    ask,
    editorRef,
    visualRef,
    setSidebarSection,
  })
  const { tabStrip, tabContextMenu, openTabMenu } = useTabs({
    data,
    current,
    commit,
    tabsVisible: prefs.tabsVisible,
    previewId,
    open: openNote,
    keep: keepNote,
    rename: renameNote,
    close: closeTab,
    trash: deleteNote,
    create: () => createNote(),
  })
  const sidebarVisible =
    !focusMode && (prefs.sidebarVisible ?? !window.matchMedia('(max-width: 600px)').matches)
  const images = useMemo(() => libraryImages(data, diskImages), [data, diskImages])
  const openTasks = useMemo(
    () =>
      data.notes.reduce(
        (sum, note) =>
          sum + resolvedTasks(note.body, data.notes).filter((task) => !task.done).length,
        0,
      ),
    [data.notes],
  )

  useEffect(() => {
    let disposed = false
    let cleanup = () => {}
    protectPendingSaves(
      {
        whenIdle: async (...args) => {
          const failure = await writer.current.whenIdle(...args)
          await noteHistory.flush()
          return failure
        },
      },
      persistence.kind !== 'web',
      window,
      undefined,
      {
        onBlocked: ({ forceClose }) => {
          toast.error(
            t(persistence.saveIssue?.localSaved ? 'window.closePending' : 'window.closeBlocked'),
            {
              id: 'close-blocked',
              duration: Infinity,
              description: (
                <ToastButtons
                  items={[
                    [t('menu.backupDownload'), () => toastActions.current.downloadBackup()],
                    [
                      t('window.closeWithoutSaving'),
                      async () => {
                        if (!(await toastActions.current.confirmClose())) return
                        try {
                          await forceClose()
                        } catch (cause) {
                          setError(friendlyError(cause))
                        }
                      },
                    ],
                  ]}
                />
              ),
            },
          )
        },
      },
    )
      .then((stop) => {
        if (disposed) stop()
        else cleanup = stop
      })
      .catch((cause) => setError(friendlyError(cause)))
    return () => {
      disposed = true
      cleanup()
    }
  }, [persistence, noteHistory, writer, setError])

  useEffect(() => {
    let disposed = false
    let cleanup = () => {}
    restoreWindowState()
      .then((stop) => {
        if (disposed) stop()
        else cleanup = stop
      })
      .catch(() => {})
    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  // In-app replacements for window.confirm/prompt/alert (unsupported in Tauri webviews).
  function ask(dialog) {
    return new Promise((resolve) => setAsking({ ...dialog, resolve }))
  }
  function answer(value) {
    asking.resolve(value)
    setAsking(null)
  }
  async function openWiki(target) {
    const parts = wikiParts(target)
    const note = parts.name ? findNote(current.current.notes, target) : active
    if (note) {
      openNote(note.id)
      if (parts.heading) {
        const lines = note.body.split('\n')
        let offset = 0
        for (const line of lines) {
          if (
            line
              .replace(/^#{1,6}\s+/, '')
              .trim()
              .toLocaleLowerCase() === parts.heading.toLocaleLowerCase()
          ) {
            setTimeout(() => {
              visualRef.current?.dispatch({ selection: { anchor: offset }, scrollIntoView: true })
              visualRef.current?.focus()
            }, 0)
            break
          }
          offset += line.length + 1
        }
      }
      return
    }
    if (!parts.name) return
    const accepted = await ask({
      kind: 'confirm',
      message: t('wiki.create', { name: parts.name }),
      confirmLabel: t('wiki.createConfirm'),
    })
    if (accepted) createNote(parts.name, `# ${parts.name.replace(/\.md$/i, '')}\n\n`)
  }
  function updateBody(body, editorChanges, readTransactions = () => []) {
    const old = current.current
    // A file opened in place keeps its own first line.
    const active = old.notes.find((note) => note.id === old.activeId)
    if (!isExternalNote(active ?? {})) body = ensureTitle(body)
    const previousBody = old.notes.find((note) => note.id === old.activeId)?.body ?? ''
    const transactions = noteHistory.enabled ? readTransactions(previousBody, body) : []
    if (previousBody !== body) {
      const changes =
        editorChanges ?? pendingSearchChanges.current ?? documentChanges(previousBody, body)
      setFindOptions((options) =>
        options.scope ? { ...options, scope: mapSearchScope(options.scope, changes) } : options,
      )
    }
    if (old.activeId === previewId) setPreviewId(null)
    // The name of a file opened in place is its file name; the title never renames it.
    const name = isExternalNote(active ?? {})
      ? null
      : nameFromHeading(body, old.notes, old.activeId)
    const previousName = old.notes.find((note) => note.id === old.activeId)?.name
    const rewrite = (note) => {
      const active = note.id === old.activeId
      const content = active ? body : note.body
      const nextBody =
        name && previousName && name !== previousName
          ? renameWikiReferences(
              content,
              previousName,
              name,
              active ? undefined : noteReferences(note).wiki,
            )
          : content
      return active || nextBody !== note.body
        ? {
            ...note,
            name: active ? (name ?? note.name) : note.name,
            body: nextBody,
            revision: note.revision + 1,
          }
        : note
    }
    for (const tr of noteHistory.enabled ? transactions : [])
      noteHistory.record(
        { ...active, revision: active.revision + 1 },
        tr.before,
        tr.after,
        tr.origin,
        pasteGesture(),
        tr.changes,
      )
    commit({
      ...old,
      notes: old.notes.map(rewrite),
      trash: old.trash.map((entry) => ({ ...entry, note: rewrite(entry.note) })),
    })
  }

  useEffect(() => {
    const field = editorRef.current
    if (mode !== 'source' || !field) return
    const clampSelection = () => {
      if (document.activeElement === field && field.selectionStart < 2)
        field.setSelectionRange(2, Math.max(2, field.selectionEnd), field.selectionDirection)
    }
    field.addEventListener('select', clampSelection)
    field.addEventListener('focus', clampSelection)
    document.addEventListener('selectionchange', clampSelection)
    return () => {
      field.removeEventListener('select', clampSelection)
      field.removeEventListener('focus', clampSelection)
      document.removeEventListener('selectionchange', clampSelection)
    }
  }, [mode, active?.id])
  function changeSource(event) {
    const field = event.target
    const raw = field.value
    const normalized = ensureTitle(raw)
    const from = titlePosition(raw, normalized, field.selectionStart)
    const to = titlePosition(raw, normalized, field.selectionEnd)
    updateBody(normalized)
    updateSelectionStatistics(normalized.slice(from, to))
    if (raw !== normalized) requestAnimationFrame(() => field.setSelectionRange(from, to))
  }
  function wrapSourceSelection(event) {
    const block = blockShortcut(event)
    if (block) {
      event.preventDefault()
      event.stopPropagation()
      if (block === 'image') {
        pickImages()
        return
      }
      const field = event.currentTarget
      const edit = blockEdit(field.value, field.selectionStart, field.selectionEnd, block)
      if (!edit) return
      field.setSelectionRange(edit.from, edit.to)
      if (!document.execCommand('insertText', false, edit.insert)) {
        field.setRangeText(edit.insert, edit.from, edit.to, 'end')
        updateBody(field.value)
      }
      field.setSelectionRange(edit.selectionFrom, edit.selectionTo)
      updateSelectionStatistics(field.value.slice(edit.selectionFrom, edit.selectionTo))
      return
    }
    const shortcut = formatShortcut(event)
    if (shortcut) {
      const field = event.currentTarget
      const edit = shortcutEdit(field.value, field.selectionStart, field.selectionEnd, shortcut)
      if (!edit) return
      event.preventDefault()
      event.stopPropagation()
      field.setRangeText(edit.insert, edit.from, edit.to, 'preserve')
      field.setSelectionRange(edit.selectionFrom, edit.selectionTo)
      updateBody(field.value)
      return
    }
    if (
      !event.isComposing &&
      event.ctrlKey &&
      event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      ['ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      const field = event.currentTarget
      const backward = field.selectionDirection === 'backward'
      const moved = moveListItems(
        field.value,
        backward ? field.selectionEnd : field.selectionStart,
        backward ? field.selectionStart : field.selectionEnd,
        event.key === 'ArrowUp' ? -1 : 1,
      )
      if (moved) {
        event.preventDefault()
        if (moved.changes.length) {
          field.value = applyChanges(field.value, moved.changes)
          field.setSelectionRange(
            Math.min(moved.anchor, moved.head),
            Math.max(moved.anchor, moved.head),
            backward ? 'backward' : 'forward',
          )
          updateBody(field.value)
        }
        return
      }
    }
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    const field = event.currentTarget
    if (event.key === 'Tab') {
      const changes = listIndentChanges(
        field.value,
        field.selectionStart,
        field.selectionEnd,
        event.shiftKey,
      )
      if (changes) {
        event.preventDefault()
        if (changes.length) {
          const start = mapPosition(field.selectionStart, changes)
          const end = mapPosition(field.selectionEnd, changes)
          field.value = applyChanges(field.value, changes)
          field.setSelectionRange(start, end)
          updateBody(field.value)
        }
        return
      }
    }
    if (event.key === 'Tab') {
      const target = titleNavigationTarget(field.value, field.selectionStart, event.shiftKey)
      if (target !== null) {
        event.preventDefault()
        if (target > field.value.length) {
          field.setRangeText('\n', field.value.length, field.value.length, 'end')
          updateBody(field.value)
        }
        field.setSelectionRange(target, target)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && field.selectionStart === field.selectionEnd) {
      const continued = continueBlock(field.value, field.selectionStart)
      if (continued) {
        event.preventDefault()
        field.setRangeText(continued.insert, continued.from, continued.to, 'end')
        field.setSelectionRange(continued.cursor, continued.cursor)
        updateBody(field.value)
        return
      }
    }
    const wrapped = wrapSelection(field.value, field.selectionStart, field.selectionEnd, event.key)
    if (!wrapped) return
    event.preventDefault()
    const start = field.selectionStart,
      end = field.selectionEnd
    field.setRangeText(wrapped.insert, start, end, 'preserve')
    field.setSelectionRange(wrapped.from, wrapped.to)
    updateBody(field.value)
  }
  async function importFiles(files, { openExistingIfSame = false } = {}) {
    setImportError('')
    const failures = []
    for (const file of files) {
      try {
        const body = await readNoteFile(file, persistence.invoke)
        const baseName = file.name.replace(/\.(md|markdown|txt)$/i, '') || 'new note'
        const name = headingFileName(body) ?? `${baseName}.md`
        const existing = current.current.notes.find(
          (note) => note.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
        if (!existing) createNote(name, body)
        else if (
          (typeof openExistingIfSame === 'function'
            ? openExistingIfSame(file)
            : openExistingIfSame) &&
          existing.body === body
        )
          openNote(existing.id)
        else if (conflictRef.current) conflictQueue.current.push({ name, body, id: existing.id })
        else openConflict({ name, body, id: existing.id })
      } catch (cause) {
        failures.push(`${file.name}: ${friendlyError(cause, t('error.readFile'))}`)
      }
    }
    if (failures.length) setImportError(failures.join('\n'))
    return failures
  }
  /** Copies a file opened in place into the notes; the original stays where it is. */
  function copyExternalToNotes(id = current.current.activeId) {
    const note = current.current.notes.find((item) => item.id === id)
    if (!note || !isExternalNote(note)) return
    noteHistory.record(note, note.body, note.body, 'copia')
    createNote(note.name, note.body)
  }
  const importFilesRef = useRef(importFiles)
  importFilesRef.current = importFiles
  /** Opens files in place: the note keeps saving to the file it came from. */
  function openExternalFiles(files) {
    const old = current.current
    let notes = old.notes
    const ids = []
    for (const file of files) {
      const existing = notes.find((note) => note.external?.path === file.path)
      if (existing) {
        ids.push(existing.id)
        continue
      }
      const note = externalNote({
        id: crypto.randomUUID(),
        name: uniqueName(notes, file.name),
        path: file.path,
        contents: file.contents,
      })
      notes = [...notes, note]
      ids.push(note.id)
    }
    if (!ids.length) return
    commit({
      ...old,
      notes,
      openIds: [...old.openIds, ...ids.filter((id) => !old.openIds.includes(id))],
      activeId: ids.at(-1),
    })
    if (mode === 'reading') setMode('visual')
    setTimeout(focusEditor, 0)
  }
  const openExternalFilesRef = useRef(openExternalFiles)
  openExternalFilesRef.current = openExternalFiles

  useEffect(() => {
    if (!persistence.invoke) return
    let active = true
    let unlisten = () => {}
    let draining = false
    let drainAgain = false

    async function drainOpenedFiles() {
      if (draining) {
        drainAgain = true
        return
      }
      draining = true
      do {
        drainAgain = false
        try {
          const files = await persistence.invoke('take_opened_files')
          if (!active || files.length === 0) continue
          const failures = []
          const importable = []
          const inPlace = []
          for (const file of files) {
            if (file.error)
              failures.push(`${file.name}: ${friendlyError(file.error, t('error.readFile'))}`)
            else if (file.sameNotesFolder)
              importable.push({
                name: file.name,
                sameNotesFolder: true,
                text: async () => file.contents,
              })
            else inPlace.push(file)
          }
          if (inPlace.length) openExternalFilesRef.current(inPlace)
          failures.push(
            ...(await importFilesRef.current(importable, {
              openExistingIfSame: (file) => file.sameNotesFolder,
            })),
          )
          if (active && failures.length) setImportError(failures.join('\n'))
        } catch (cause) {
          if (active) setImportError(friendlyError(cause, t('error.readFile')))
        }
      } while (active && drainAgain)
      draining = false
    }

    listen('open-note-files', drainOpenedFiles)
      .then((stop) => {
        if (!active) return stop()
        unlisten = stop
        drainOpenedFiles()
      })
      .catch((cause) => {
        if (active) setImportError(friendlyError(cause, t('error.readFile')))
      })

    return () => {
      active = false
      unlisten()
    }
  }, [persistence])
  function openConflict(next) {
    conflictRef.current = next
    setConflict(next)
  }
  async function switchFolder(change) {
    if (switching || imageBusy) return
    setSwitching(true)
    setFolderError('')
    try {
      await writer.current.whenIdle()
      const failure = await persistence.save(current.current)
      if (failure) throw new Error(failure)
      if (await change()) window.location.reload()
    } catch (cause) {
      setFolderError(friendlyError(cause))
    } finally {
      setSwitching(false)
    }
  }
  function chooseFolder() {
    return switchFolder(() =>
      connectVault(
        persistence.invoke,
        (count) =>
          ask({
            kind: 'confirm',
            message: t('dialog.folderCopy', { count }),
            confirmLabel: t('dialog.folderCopyConfirm'),
            cancelLabel: t('dialog.folderCopyDecline'),
            dismissLabel: t('dialog.cancel'),
          }),
        current.current,
      ),
    )
  }
  function useAppStorage() {
    return switchFolder(async () => {
      await persistence.invoke(VAULT_DISCONNECT)
      return true
    })
  }
  function showImages() {
    setSidebarSection('images')
    updatePrefs({ sidebarVisible: true })
  }
  function refreshImages() {
    clearImageCache()
    setImageVersion((value) => value + 1)
  }
  async function openDroppedNotes(files) {
    const opened = []
    const failures = []
    for (const file of files) {
      try {
        opened.push(await persistence.invoke('note_open_dropped', { path: file.nativePath }))
      } catch (cause) {
        failures.push(`${file.name}: ${friendlyError(cause, t('error.readFile'))}`)
      }
    }
    if (opened.length) openExternalFilesRef.current(opened)
    if (failures.length) setImportError(failures.join('\n'))
  }
  function routeNoteDrop(files, position) {
    const target = document.elementFromPoint(position.x, position.y)
    if (!target?.closest('.editor-shell')) return openDroppedNotes(files)
    // Dropped into the text, the intent is unclear: editing the original and importing a
    // copy both make sense, so the user decides.
    toast(t('drop.ask'), {
      id: 'note-drop',
      duration: 15000,
      action: { label: t('drop.openInPlace'), onClick: () => openDroppedNotes(files) },
      cancel: { label: t('drop.import'), onClick: () => importFilesRef.current(files) },
    })
  }
  const nativeDropHandler = useRef(null)
  nativeDropHandler.current = (dropped, position) => {
    const { notes, others } = splitDrop(dropped)
    if (notes.length && !blocked && !switching) routeNoteDrop(notes, position)
    if (others.length)
      routeNativeImageDrop(others, position, (files, point) =>
        addImages(
          files,
          insertionPoint({ dataTransfer: true, clientX: point.x, clientY: point.y }),
        ),
      )
  }
  useEffect(() => {
    if (!persistence.invoke) return
    let disposed = false
    let unlisten = () => {}
    listenNativeImageDrops((files, position) => nativeDropHandler.current(files, position))
      .then((stop) => {
        if (disposed) stop()
        else unlisten = stop
      })
      .catch((cause) => setImportError(String(cause.message ?? cause)))
    return () => {
      disposed = true
      unlisten()
    }
  }, [persistence.invoke])
  function insertionPoint(event) {
    if (mode === 'source' && editorRef.current)
      return { from: editorRef.current.selectionStart, to: editorRef.current.selectionEnd }
    if (mode === 'visual' && visualRef.current) {
      const view = visualRef.current
      const at = event?.dataTransfer
        ? view.posAtCoords({ x: event.clientX, y: event.clientY })
        : null
      return at === null || at === undefined
        ? { from: view.state.selection.main.from, to: view.state.selection.main.to }
        : { from: at, to: at }
    }
    return { from: active?.body.length ?? 0, to: active?.body.length ?? 0 }
  }
  function pickImages() {
    imagePoint.current = insertionPoint()
    imageInput.current?.click()
  }
  function insertMarkdown(text, point = insertionPoint(), noteId = active?.id) {
    const note = current.current.notes.find((item) => item.id === noteId)
    if (!note) return
    const titleEnd = note.body.indexOf('\n') < 0 ? note.body.length : note.body.indexOf('\n')
    const from = Math.max(titleEnd, Math.min(point.from, note.body.length)),
      to = Math.max(from, Math.min(point.to, note.body.length))
    const insert = `${from && note.body[from - 1] !== '\n' ? '\n' : ''}${text}\n`
    if (mode === 'visual' && current.current.activeId === noteId && visualRef.current) {
      visualRef.current.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        userEvent: 'input.paste',
        scrollIntoView: true,
      })
      visualRef.current.focus()
    } else if (mode === 'source' && current.current.activeId === noteId && editorRef.current) {
      const field = editorRef.current
      field.focus()
      field.setSelectionRange(from, to)
      if (!document.execCommand('insertText', false, insert)) {
        updateBody(note.body.slice(0, from) + insert + note.body.slice(to))
      }
    } else {
      const next = note.body.slice(0, from) + insert + note.body.slice(to)
      commit({
        ...current.current,
        notes: current.current.notes.map((item) =>
          item.id === noteId ? { ...item, body: next, revision: item.revision + 1 } : item,
        ),
      })
      if (mode === 'source')
        setTimeout(() => {
          editorRef.current?.focus()
          editorRef.current?.setSelectionRange(from + insert.length, from + insert.length)
        }, 0)
    }
    return { from: from + insert.length, to: from + insert.length }
  }
  async function addImages(files, point = insertionPoint(), noteId = active?.id) {
    if (imageBusy || blocked || switching) return
    setImageBusy(true)
    setImportError('')
    try {
      for (const file of files) {
        const src = await importImage(file, persistence.invoke)
        commit({
          ...current.current,
          assets: [...(current.current.assets ?? []), { name: file.name, src }],
        })
        if (noteId) {
          point = insertMarkdown(markdownImage(file.name, src), point, noteId)
          const note = current.current.notes.find((note) => note.id === noteId)
          if (!note) break
        }
      }
      refreshImages()
    } catch (cause) {
      setImportError(String(cause.message ?? cause))
    } finally {
      setImageBusy(false)
    }
  }
  async function pasteNativeClipboard() {
    if (
      clipboardBusy.current ||
      imageBusy ||
      blocked ||
      switching ||
      !active ||
      !document.hasFocus() ||
      document.visibilityState === 'hidden'
    )
      return
    const focusEpoch = clipboardFocusEpoch.current
    const point = insertionPoint()
    const noteId = active.id
    const editorMode = mode
    const view = visualRef.current
    const field = editorRef.current
    clipboardBusy.current = true
    setImportError('')
    try {
      const contents = await readNativeClipboard(persistence.invoke)
      if (
        focusEpoch !== clipboardFocusEpoch.current ||
        !document.hasFocus() ||
        document.visibilityState === 'hidden'
      )
        return
      if (contents?.kind === 'image') {
        await addImages(contents.files, point, noteId)
      } else if (contents?.kind === 'text' && current.current.activeId === noteId) {
        if (editorMode === 'visual' && view === visualRef.current) {
          view.focus()
          view.dispatch({ selection: { anchor: point.from, head: point.to } })
          const clipboardData = new DataTransfer()
          clipboardData.setData('text/plain', contents.text)
          pasteIntentGuard.dispatchPaste(
            view.contentDOM,
            new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
          )
        } else if (editorMode === 'source' && field === editorRef.current && field) {
          field.focus()
          field.setSelectionRange(point.from, point.to)
          if (!document.execCommand('insertText', false, contents.text)) {
            field.setRangeText(contents.text, point.from, point.to, 'end')
            updateBody(field.value)
          }
        }
      }
    } catch (cause) {
      setImportError(String(cause.message ?? cause))
    } finally {
      clipboardBusy.current = false
    }
  }
  async function renameImage(image) {
    const proposed = (
      await ask({ kind: 'prompt', label: t('images.rename'), initial: image.name })
    )?.trim()
    if (!proposed || proposed === image.name) return
    setImageBusy(true)
    try {
      let src = image.src
      if (persistence.invoke && image.src.startsWith('assets/')) {
        const extension = image.src.split('.').pop()
        src = `assets/${crypto.randomUUID()}.${extension}`
        const url = await resolveImage(image.src)
        await persistence.invoke('image_write', { name: src, bytes: dataUrlBytes(url) })
      }
      const document = replaceDocumentImage(current.current, image.src, src)
      const assets = (document.assets ?? []).filter((asset) => asset.src !== src)
      commit({ ...document, assets: [...assets, { src, name: proposed }] })
      setSelectedImage(src)
      const failure = await writer.current.whenIdle()
      if (failure) throw new Error(failure)
      if (src !== image.src) await persistence.invoke('image_delete', { name: image.src })
      refreshImages()
    } catch (cause) {
      setImportError(String(cause.message ?? cause))
    } finally {
      setImageBusy(false)
    }
  }

  async function deleteImage(image) {
    const referenced = noteImages(allNotes(current.current)).some(
      (entry) => entry.src === image.src,
    )
    if (referenced) return
    if (
      !(await ask({
        kind: 'confirm',
        message: t('images.deleteConfirm', { name: image.name }),
        confirmLabel: t('images.delete'),
      }))
    )
      return
    await removeImages([image])
  }
  async function deleteUnusedImages(images) {
    if (
      !images.length ||
      !(await ask({
        kind: 'confirm',
        message: t('images.cleanConfirm', { count: images.length }),
        confirmLabel: t('images.delete'),
      }))
    )
      return
    await removeImages(images)
  }
  async function removeImages(images) {
    setImageBusy(true)
    setImportError('')
    toast.dismiss('image-delete')
    try {
      const failure = await writer.current.whenIdle()
      if (failure) throw new Error(failure)
      for (const image of images) {
        if (noteImages(allNotes(current.current)).some((entry) => entry.src === image.src))
          throw new Error(t('images.protected'))
        if (persistence.invoke && !/^(data:|https?:)/i.test(image.src))
          await persistence.invoke('image_delete', { name: normalizeImageSource(image.src) })
        commit({
          ...current.current,
          assets: (current.current.assets ?? []).filter(
            (asset) => normalizeImageSource(asset.src) !== image.src,
          ),
        })
      }
      setSelectedImage(null)
      refreshImages()
    } catch (cause) {
      toast.error(t('images.deleteFailed', { error: friendlyError(cause) }), {
        id: 'image-delete',
        duration: 10000,
      })
    } finally {
      setImageBusy(false)
    }
  }
  async function downloadImage(image) {
    try {
      const url = await resolveImage(image.src)
      const response = await fetch(url)
      if (!response.ok) throw new Error(t('images.unavailable'))
      download(
        image.name,
        await response.blob(),
        response.headers.get('content-type') ?? 'image/png',
      )
    } catch (cause) {
      setImportError(String(cause.message ?? cause))
    }
  }
  useEffect(() => {
    if (sidebarSection !== 'images' || !sidebarVisible || !persistence.invoke) return
    let stopped = false
    let pending = false
    const load = async () => {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      try {
        const names = await persistence.invoke('image_list')
        if (!stopped)
          setDiskImages((previous) => {
            const next = names.map((src) => ({ src, name: src.split('/').at(-1) }))
            return JSON.stringify(previous) === JSON.stringify(next) ? previous : next
          })
      } catch (cause) {
        if (!stopped) setImportError(String(cause))
      } finally {
        pending = false
        if (!stopped) setImagesLoading(false)
      }
    }
    setImagesLoading(true)
    void load()
    const onFocus = () => {
      void load()
    }
    const timer = setInterval(onFocus, 15000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [sidebarSection, sidebarVisible, imageVersion, persistence])
  function resolveSync(choice) {
    const [conflict, ...rest] = syncConflicts
    setSyncConflicts(rest)
    const note = current.current.notes.find((note) => note.id === conflict.id)
    if (note) {
      noteHistory.record(note, note.body, note.body, 'conflito')
      if (typeof conflict.external === 'string')
        noteHistory.record(note, conflict.external, conflict.external, 'conflito')
    }
    commit(persistence.sync.resolve(current.current, conflict, choice), 'disco')
  }
  async function downloadBackup() {
    if (backupBusy.current) return
    backupBusy.current = true
    toast.loading(t('backup.preparing'), { id: 'backup-download' })
    try {
      download(
        'sloth-note-backup.json',
        await createFullBackup(current.current, persistence.invoke),
        'application/json;charset=utf-8',
      )
      toast.success(t('backup.downloadStarted'), { id: 'backup-download', duration: 10000 })
    } catch (cause) {
      toast.error(t('backup.failed', { error: friendlyError(cause) }), {
        id: 'backup-download',
        duration: Infinity,
      })
    } finally {
      backupBusy.current = false
    }
  }
  async function restoreBackup(file) {
    if (!file) return
    setImportError('')
    try {
      const bundle = readBackupBundle(await file.text())
      let restored = bundle.document
      const confirmed = await ask({
        kind: 'confirm',
        message: t('dialog.backupReplace', {
          notes: restored.notes.length,
          trash: restored.trash.length,
        }),
        confirmLabel: t('dialog.backupReplaceConfirm'),
      })
      if (!confirmed) return
      restored = await restoreBackupImages(bundle, persistence.invoke)
      commit(restored)
      refreshImages()
      if (mode === 'reading') setMode('visual')
      setFindOpen(false)
      setSidebarSection('notes')
    } catch (cause) {
      setImportError(friendlyError(cause, t('error.readBackup')))
    }
  }
  function resolveConflict(replace) {
    if (!conflict) return
    if (replace) {
      const old = current.current
      commit({
        ...old,
        notes: old.notes.map((note) =>
          note.id === conflict.id
            ? { ...note, body: conflict.body, revision: note.revision + 1 }
            : note,
        ),
        openIds: old.openIds.includes(conflict.id) ? old.openIds : [...old.openIds, conflict.id],
        activeId: conflict.id,
      })
      if (mode === 'reading') setMode('visual')
    } else createNote(conflict.name, conflict.body)
    closeConflict()
  }
  function closeConflict() {
    const next = conflictQueue.current.shift() ?? null
    conflictRef.current = next
    setConflict(next)
    if (next) return
    setTimeout(() => menuButton.current?.focus(), 0)
  }
  async function copyCode(source) {
    try {
      await navigator.clipboard.writeText(source)
      toast.success(t('code.copied'), { id: 'copy', duration: 1800 })
    } catch {
      toast.error(t('code.copyFailed'), { id: 'copy' })
    }
  }
  function openPalette() {
    returnFocus.current = menuOpen ? menuButton.current : document.activeElement
    setQuery('')
    setSelected(0)
    setPalette(true)
  }
  function closePalette() {
    setPalette(false)
    setTimeout(
      () => (returnFocus.current?.isConnected ? returnFocus.current : menuButton.current)?.focus(),
      0,
    )
  }
  function closeCommands() {
    setCommandsOpen(false)
    setTimeout(
      () => (returnFocus.current?.isConnected ? returnFocus.current : menuButton.current)?.focus(),
      0,
    )
  }
  function closeMenu(restoreFocus = true) {
    setMenuOpen(false)
    if (restoreFocus)
      setTimeout(() => {
        if (!document.querySelector('[role="dialog"]')) menuButton.current?.focus()
      }, 0)
  }
  function toggleMainMenu() {
    if (document.querySelector('[aria-modal="true"]')) return
    if (menuOpen) closeMenu()
    else {
      setFocusMode(false)
      setMenuOpen(true)
    }
  }
  useLayoutEffect(() => {
    const view = mode !== 'source' ? visualRef.current : null
    const field = mode === 'source' ? editorRef.current : null
    const text = view
      ? view.state.selection.ranges
          .filter((range) => !range.empty)
          .map((range) => view.state.doc.sliceString(range.from, range.to))
          .join('\n')
      : field
        ? field.value.slice(field.selectionStart, field.selectionEnd)
        : ''
    setSelectedText({ id: active?.id, mode, text })
  }, [active?.id, mode])
  function updateSelectionStatistics(text) {
    setSelectedText((previous) =>
      previous.id === active?.id && previous.mode === mode && previous.text === text
        ? previous
        : { id: active?.id, mode, text },
    )
  }
  function captureSearchSelection(selection) {
    if (!findOpen || !selection || selection.to <= selection.from) return
    setFindOptions((options) => ({ ...options, scope: { from: selection.from, to: selection.to } }))
  }
  function searchAllNotes() {
    updatePrefs({ sidebarVisible: true })
    setSidebarSection('notes')
    setFocusMode(false)
    setTimeout(() => {
      sidebarSearchRef.current?.focus()
      sidebarSearchRef.current?.select()
    }, 0)
  }
  function openNoteSearch(noteId, query) {
    openNote(noteId)
    if (mode === 'reading') setMode('visual')
    setFindQuery(query)
    setFindOptions({
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      preserveCase: false,
      selectionOnly: false,
      scope: null,
    })
    setFindIndex(0)
    setReplaceOpen(false)
    setFindOpen(true)
  }
  function openFind(replace = false) {
    setReplaceOpen(replace)
    const selection =
      mode !== 'source'
        ? visualRef.current?.state.selection.main
        : mode === 'source' && editorRef.current
          ? { from: editorRef.current.selectionStart, to: editorRef.current.selectionEnd }
          : null
    const editorFocused =
      mode !== 'source' ? visualRef.current?.hasFocus : document.activeElement === editorRef.current
    if (!findOpen || editorFocused) {
      const selectedText =
        selection && selection.to > selection.from
          ? active?.body.slice(selection.from, selection.to)
          : ''
      if (selectedText) setFindQuery(selectedText)
    }
    if (!findOpen || (editorFocused && selection && selection.to > selection.from)) {
      setFindOptions((options) => ({
        ...options,
        selectionOnly: findOpen && options.selectionOnly,
        scope:
          selection && selection.to > selection.from
            ? { from: selection.from, to: selection.to }
            : null,
      }))
    }
    setMenuOpen(false)
    if (mode === 'reading') setMode('visual')
    setFindOpen(true)
    setFindIndex(0)
    setTimeout(() => {
      const input = replace ? replaceInput.current : findInput.current
      input?.focus({ preventScroll: true })
      input?.select()
    }, 0)
  }
  function closeFind() {
    setFindOpen(false)
    setTimeout(focusEditor, 0)
  }
  function currentMatches() {
    return active ? searchNote(active.body, findQuery, findOptions).matches : []
  }
  function revealSourceMatch(match, index) {
    const field = editorRef.current
    const marker = document.querySelector(`[data-search-index="${index}"]`)
    if (!field || !marker) return
    field.setSelectionRange(match.start, match.end)
    field.scrollTop = marker.offsetTop - field.clientHeight / 2
    field.previousElementSibling.scrollTop = field.scrollTop
    const rect = marker.getBoundingClientRect()
    const top = (document.querySelector('.find-dialog')?.getBoundingClientRect().bottom ?? 80) + 24
    const bottom = window.innerHeight - 70
    if (rect.top < top || rect.bottom > bottom)
      window.scrollBy({ top: rect.top - (top + bottom) / 2, behavior: 'instant' })
  }
  function selectFind(index = findIndex) {
    const matches = currentMatches()
    if (!matches.length) return
    const safeIndex = (index + matches.length) % matches.length
    const match = matches[safeIndex]
    if (mode === 'source' && editorRef.current) revealSourceMatch(match, safeIndex)
    else if (visualRef.current) revealSearchMatch(visualRef.current, match)
    findInput.current?.focus({ preventScroll: true })
    setFindIndex(safeIndex)
  }
  function replaceFind(all = false) {
    if (!active) return
    const matches = currentMatches()
    if (!matches.length) return
    findNavigation.current = null
    const selected = all ? matches : [matches[Math.min(findIndex, matches.length - 1)]]
    const changes = selected.map((match) => ({
      from: match.start,
      to: match.end,
      insert: replacementText(active.body, match, replacement, findOptions),
    }))
    const changeSet = ChangeSet.of(changes, active.body.length)
    const nextOptions = { ...findOptions, scope: mapSearchScope(findOptions.scope, changeSet) }
    if (mode === 'visual' && visualRef.current) {
      visualRef.current.dispatch({ changes: changeSet, userEvent: 'input.replace' })
    } else {
      let body = active.body
      for (const change of [...changes].reverse())
        body = body.slice(0, change.from) + change.insert + body.slice(change.to)
      const field = editorRef.current
      pendingSearchChanges.current = changeSet
      if (field && body.startsWith('# ')) {
        field.focus({ preventScroll: true })
        field.setSelectionRange(2, active.body.length)
        if (!document.execCommand('insertText', false, body.slice(2))) updateBody(body)
        findInput.current?.focus({ preventScroll: true })
      } else updateBody(body)
      pendingSearchChanges.current = null
    }
    if (!all) {
      const nextStart = changes[0].from + changes[0].insert.length
      let body =
        active.body.slice(0, changes[0].from) + changes[0].insert + active.body.slice(changes[0].to)
      const next = searchNote(body, findQuery, nextOptions).matches.findIndex(
        (match) =>
          match.start >= nextStart &&
          (match.start > changes[0].from || changes[0].to > changes[0].from),
      )
      setFindIndex(Math.max(0, next))
    } else setFindIndex(0)
  }
  useEffect(() => {
    setFindOptions((options) =>
      options.scope ? { ...options, scope: null, selectionOnly: false } : options,
    )
  }, [active?.id])
  const findResult = useMemo(
    () => searchNote(active?.body ?? '', findQuery, findOptions),
    [active?.body, findQuery, findOptions],
  )
  useEffect(() => {
    const view = mode !== 'source' ? visualRef.current : null
    const matches = findOpen ? findResult.matches : []
    const index = Math.min(findIndex, Math.max(0, matches.length - 1))
    if (index !== findIndex) setFindIndex(index)
    const navigationKey = JSON.stringify([
      findOpen,
      findQuery,
      { ...findOptions, scope: null },
      index,
      mode,
      active?.id,
    ])
    const navigate = navigationKey !== findNavigation.current
    findNavigation.current = navigationKey
    if (view) {
      view.dispatch({
        effects: setSearchHighlights.of({
          matches,
          index,
          scope: findOpen && findOptions.selectionOnly ? findOptions.scope : null,
        }),
      })
      if (navigate && matches[index]) revealSearchMatch(view, matches[index])
    } else if (navigate && findOpen && matches[index]) {
      revealSourceMatch(matches[index], index)
    }
  }, [findOpen, findQuery, findOptions, findResult, findIndex, mode, active?.id])
  function runMenu(action, restoreFocus = true) {
    setMenuOpen(false)
    action()
    if (restoreFocus)
      setTimeout(() => {
        if (!document.querySelector('[role="dialog"]')) menuButton.current?.focus()
      }, 0)
  }
  function toggleFocusMode() {
    const view = mode !== 'source' ? visualRef.current : null
    const position = view?.state.selection.main.head
    const before = view && view.coordsAtPos(position)
    setFocusMode((value) => !value)
    setMenuOpen(false)
    requestAnimationFrame(() => {
      if (mode !== 'reading') focusEditor()
      else document.querySelector('.editor-shell')?.focus({ preventScroll: true })
      if (view && before)
        view.requestMeasure({
          read: () => view.coordsAtPos(position),
          write: (after) => {
            if (after) window.scrollBy({ top: after.top - before.top, behavior: 'instant' })
          },
        })
    })
  }
  function changeMode(next) {
    setMode(next)
    setMenuOpen(false)
  }
  async function resetDamagedStorage() {
    const failure = await persistence.save(current.current)
    setError(failure)
    if (!failure) setBlocked(false)
  }

  // Pick up notes changed outside the app: on a timer and when the window regains focus.
  useEffect(() => {
    const sync = persistence.sync
    if (!sync) return
    let stopped = false
    let running = false
    async function poll() {
      if (running || stopped || switching || document.visibilityState === 'hidden') return
      running = true
      try {
        await writer.current.whenIdle({ flush: false })
        const files = await sync.scan()
        if (files === null || stopped) return
        const result = sync.merge(current.current, files)
        if (result.changed) commit(result.document, 'disco')
        setSyncConflicts(result.conflicts)
        setFolderError('')
      } catch (cause) {
        setFolderError(friendlyError(cause))
      } finally {
        running = false
      }
    }
    const timer = setInterval(poll, 2500)
    window.addEventListener('focus', poll)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', poll)
    }
    // commit only touches refs and state setters, so it is stable enough to skip here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistence, switching])
  // Files opened in place can change on disk: follow them, and ask when both sides changed.
  useEffect(() => {
    const externals = persistence.externals
    if (!externals) return
    let stopped = false
    let running = false
    async function check() {
      if (running || stopped || switching || document.visibilityState === 'hidden') return
      if (!current.current.notes.some(isExternalNote)) return
      running = true
      try {
        await writer.current.whenIdle({ flush: false })
        const result = await externals.check(current.current)
        if (stopped) return
        if (result.document !== current.current) commit(result.document, 'disco-externo')
        for (const { id, name, disk } of result.conflicts) {
          const existing = current.current.notes.find((note) => note.id === id)
          if (existing) {
            noteHistory.record(existing, existing.body, existing.body, 'conflito')
            noteHistory.record(existing, disk, disk, 'conflito')
          }
          const settle = (useDisk) => {
            const note = current.current.notes.find((note) => note.id === id)
            if (useDisk && note) noteHistory.record(note, note.body, disk, 'disco-externo')
            externals.accept(id, disk)
            const doc = current.current
            commit(
              useDisk
                ? {
                    ...doc,
                    notes: doc.notes.map((note) =>
                      note.id === id
                        ? {
                            ...note,
                            body: disk,
                            revision: note.revision + 1,
                            external: { ...note.external, seen: disk },
                          }
                        : note,
                    ),
                  }
                : {
                    ...doc,
                    notes: doc.notes.map((note) =>
                      note.id === id
                        ? {
                            ...note,
                            revision: note.revision + 1,
                            external: { ...note.external, seen: disk },
                          }
                        : note,
                    ),
                  },
            )
          }
          toast(t('external.changed', { name }), {
            id: `external-${id}`,
            duration: Infinity,
            action: { label: t('external.useDisk'), onClick: () => settle(true) },
            cancel: { label: t('external.keepMine'), onClick: () => settle(false) },
          })
        }
      } catch {
        // A file that cannot be read is reported by the next save.
      } finally {
        running = false
      }
    }
    const timer = setInterval(check, 4000)
    window.addEventListener('focus', check)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', check)
    }
    // commit only touches refs and state setters, so it is stable enough to skip here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistence, switching])
  const toastActions = useRef({})
  toastActions.current = {
    confirmClose: () =>
      ask({
        kind: 'confirm',
        message: t(
          persistence.saveIssue?.localSaved ? 'window.closePendingConfirm' : 'window.closeConfirm',
        ),
        confirmLabel: t('window.closeWithoutSaving'),
        cancelLabel: t('dialog.cancel'),
      }),
    downloadBackup,
    retrySave: () => writer.current.write(current.current),
    downloadDamaged: () =>
      download('sloth-note-damaged.json', damaged.current, 'application/json;charset=utf-8'),
    resetDamagedStorage,
    openFolder: () => setFolderOpen(true),
    useAppStorage,
  }
  useEffect(() => {
    if (!error) {
      toast.dismiss('storage')
      return
    }
    const run = (name) => () => toastActions.current[name]()
    const detail = error.replace(/[.!?]+\s*$/, '')
    const message = persistence.saveIssue?.localSaved
      ? t('error.externalSaved', { error: detail })
      : t('error.storage', { error: detail, label: persistence.label })
    toast.error(message, {
      id: 'storage',
      duration: Infinity,
      description: (
        <ToastButtons
          items={[
            [t('menu.backupDownload'), run('downloadBackup')],
            ...(!blocked ? [[t('error.retryStorage'), run('retrySave')]] : []),
            ...(blocked && damaged.current !== null
              ? [[t('error.downloadStored'), run('downloadDamaged')]]
              : []),
            ...(blocked ? [[t('error.replaceStorage'), run('resetDamagedStorage')]] : []),
          ]}
        />
      ),
    })
  }, [error, blocked, persistence])
  useEffect(() => {
    const problem = persistence.vaultProblem
    if (!problem) return
    const run = (name) => () => toastActions.current[name]()
    toast.error(t('error.vaultMissing', { path: problem.path }), {
      id: 'vault',
      duration: Infinity,
      description: (
        <ToastButtons
          items={[
            [t('menu.folder'), run('openFolder')],
            [t('folder.useAppStorage'), run('useAppStorage')],
          ]}
        />
      ),
    })
  }, [persistence.vaultProblem])
  useEffect(() => {
    if (folderError)
      toast.error(t('error.folder', { error: folderError }), { id: 'folder', duration: 10000 })
    else toast.dismiss('folder')
  }, [folderError])
  useEffect(() => {
    if (importError)
      toast.error(t('error.import', { error: importError }), { id: 'import', duration: 10000 })
    else toast.dismiss('import')
  }, [importError])
  useEffect(() => {
    const theme =
      prefs.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : prefs.theme
    document.documentElement.dataset.theme = theme
    if (prefs.theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const change = () => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'
    }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [prefs.theme])
  useEffect(() => {
    if (palette) search.current?.focus()
  }, [palette])
  useEffect(() => {
    if (palette) document.querySelector('.results .selected')?.scrollIntoView({ block: 'nearest' })
  }, [palette, query, selected])
  useEffect(() => {
    if (conflict) conflictFirst.current?.focus()
  }, [conflict])
  useEffect(() => {
    if (menuOpen) menuFirst.current?.focus()
  }, [menuOpen])
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event) => {
      if (!menuWrap.current?.contains(event.target)) closeMenu(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [menuOpen])
  useEffect(() => {
    const onKey = (event) => {
      if (conflict) {
        if (event.key === 'Escape') closeConflict()
        return
      }
      if (menuOpen && event.key === 'Escape') {
        closeMenu()
        return
      }
      if (asking || folderOpen || shortcutsOpen || settingsOpen || commandsOpen || switching) return
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const action = appShortcut(event)
      if (action && menuActions[action]) {
        event.preventDefault()
        event.stopPropagation()
        menuActions[action]()
        return
      }
      if (modifier && event.altKey) {
        if (event.code === 'Minus' || event.key === '-') {
          event.preventDefault()
          stepWidth(-1)
        } else if (event.code === 'Equal' || event.key === '+') {
          event.preventDefault()
          stepWidth(1)
        } else if (key === '0') {
          event.preventDefault()
          updatePrefs({ contentWidth: CONTENT_WIDTH.default })
        }
        return
      }
      if (modifier && (event.key === '+' || event.code === 'Equal')) {
        event.preventDefault()
        updatePrefs({ fontSize: Math.min(FONT_SIZE.max, prefs.fontSize + 1) })
      }
      if (modifier && (event.key === '-' || event.code === 'Minus')) {
        event.preventDefault()
        updatePrefs({ fontSize: Math.max(FONT_SIZE.min, prefs.fontSize - 1) })
      }
      if (modifier && key === '0') {
        event.preventDefault()
        updatePrefs({ fontSize: FONT_SIZE.default })
      }
      if (event.key === 'Escape' && palette) closePalette()
      else if (
        event.key === 'Escape' &&
        focusMode &&
        !findOpen &&
        !document.querySelector('[role="dialog"], [role="menu"], .image-insert')
      ) {
        event.preventDefault()
        toggleFocusMode()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  function foldSections(collapse) {
    if (visualRef.current) (collapse ? foldAll : unfoldAll)(visualRef.current)
  }

  function stepWidth(steps) {
    updatePrefs({
      contentWidth: Math.min(
        CONTENT_WIDTH.max,
        Math.max(CONTENT_WIDTH.min, contentWidth(prefs) + steps * CONTENT_WIDTH.step),
      ),
    })
  }
  const menuActions = {
    mainMenu: toggleMainMenu,
    ...Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        `tab${index + 1}`,
        () => {
          const id = current.current.openIds[index]
          if (id) runMenu(() => openNote(id), false)
        },
      ]),
    ),
    focus: () => active && toggleFocusMode(),
    newNote: () => runMenu(() => createNote(), false),
    findNote: () => runMenu(openPalette, false),
    searchAllNotes: () => runMenu(searchAllNotes, false),
    findInNote: () => active && runMenu(openFind, false),
    replaceInNote: () => active && runMenu(() => openFind(true), false),
    rename: () => active && runMenu(renameNote, false),
    copyToNotes: () => active?.external && runMenu(() => copyExternalToNotes(), false),
    reopenTab: () => runMenu(reopenTab, false),
    previousTab: () => runMenu(() => selectAdjacentTab(-1), false),
    nextTab: () => runMenu(() => selectAdjacentTab(1), false),
    closeTab: () => active && runMenu(() => closeTab(active.id)),
    trashMove: () => active && runMenu(deleteNote, false),
    undoDelete: () =>
      data.trash.length && runMenu(() => restoreNote(data.trash.at(-1).note.id), false),
    images: () => runMenu(showImages, false),
    addImage: () => runMenu(pickImages, false),
    import: () => runMenu(() => importInput.current?.click(), false),
    export: () => active && runMenu(() => download(active.name, active.body)),
    backup: () => runMenu(downloadBackup),
    restoreBackup: () => runMenu(() => backupInput.current?.click(), false),
    folder: () => persistence.invoke && runMenu(() => setFolderOpen(true), false),
    trash: () =>
      runMenu(() => {
        setSidebarSection('trash')
        setSidebarQuery('')
        updatePrefs({ sidebarVisible: true })
      }, false),
    sidebar: () =>
      runMenu(
        () => updatePrefs({ sidebarVisible: !sidebarVisible }),
        menuOpen || commandsOpen || settingsOpen,
      ),
    tabs: () => runMenu(() => updatePrefs({ tabsVisible: !prefs.tabsVisible })),
    visual: () => changeMode('visual'),
    source: () => changeMode('source'),
    reading: () => changeMode('reading'),
    theme: () =>
      runMenu(() =>
        updatePrefs({
          theme: prefs.theme === 'system' ? 'light' : prefs.theme === 'light' ? 'dark' : 'system',
        }),
      ),
    smaller: () =>
      runMenu(() => updatePrefs({ fontSize: Math.max(FONT_SIZE.min, prefs.fontSize - 1) })),
    larger: () =>
      runMenu(() => updatePrefs({ fontSize: Math.min(FONT_SIZE.max, prefs.fontSize + 1) })),
    narrower: () => runMenu(() => stepWidth(-2)),
    wider: () => runMenu(() => stepWidth(2)),
    language: () =>
      runMenu(() => updatePrefs({ language: prefs.language === 'en' ? 'pt-BR' : 'en' })),
    shortcuts: () => runMenu(() => setShortcutsOpen(true), false),
    foldAll: () => active && runMenu(() => foldSections(true), false),
    unfoldAll: () => active && runMenu(() => foldSections(false), false),
    welcome: () =>
      runMenu(() => {
        const welcome = welcomeNote(prefs.language)
        createNote(welcome.name, welcome.body)
      }, false),
    changelog: () =>
      runMenu(() => {
        setSettingsSection('changelog')
        setSettingsOpen(true)
      }, false),
    history: () =>
      runMenu(() => {
        setSettingsSection('history')
        setSettingsOpen(true)
      }, false),
    status: () => runMenu(() => updatePrefs({ statusVisible: prefs.statusVisible === false })),
    settings: () =>
      runMenu(() => {
        setSettingsSection('appearance')
        setSettingsOpen(true)
      }, false),
    commands: () =>
      runMenu(() => {
        returnFocus.current = document.activeElement
        setCommandsOpen(true)
      }, false),
  }
  const backlinks = useMemo(
    () =>
      active
        ? data.notes.filter(
            (note) =>
              note.id !== active.id &&
              noteReferences(note).wiki.some(
                (link) => findNote(data.notes, link.target)?.id === active.id,
              ),
          )
        : [],
    [active, data.notes],
  )
  function showSection(section) {
    setSidebarSection(section)
    setSidebarQuery('')
  }
  const documentStats = useMemo(
    () => textStatistics(active?.body.replace(/^# /, '') ?? ''),
    [active?.body],
  )
  const wordCount = documentStats.words.toLocaleString(prefs.language)
  const characterCount = documentStats.characters.toLocaleString(prefs.language)
  const selectionStats = useMemo(
    () =>
      selectedText.id === active?.id && selectedText.mode === mode && selectedText.text
        ? textStatistics(selectedText.text)
        : null,
    [selectedText, active?.id, mode],
  )
  const formatCount = (count) => count.toLocaleString(prefs.language)
  const selectedCount = (key, count) =>
    t(count === 1 ? `${key}.one` : key, { count: formatCount(count) })
  return (
    <main
      className={focusMode ? 'app focus-mode' : 'app'}
      data-native-window={persistence.invoke ? (mac ? 'mac' : 'other') : undefined}
      style={{
        '--editor-size': `${prefs.fontSize}px`,
        '--content-width': `${contentWidth(prefs)}px`,
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDropCapture={(event) => {
        if (event.target.closest?.('.image-insert') || !event.dataTransfer.files.length) return
        event.preventDefault()
        event.stopPropagation()
        const { notes, others } = splitDrop([...event.dataTransfer.files])
        if (notes.length && !blocked && !switching) importFiles(notes)
        if (others.length && event.target.closest?.('.editor-shell'))
          addImages(others, insertionPoint(event))
      }}
    >
      {focusMode && (
        <div
          className="focus-exit-region"
          onPointerDown={(event) => {
            if (event.pointerType === 'touch' && event.target === event.currentTarget) {
              event.preventDefault()
              event.currentTarget.querySelector('button')?.focus({ preventScroll: true })
            }
          }}
        >
          <ShortcutButton
            type="button"
            className="focus-exit"
            label={t('focus.exit')}
            keys="Esc"
            onClick={toggleFocusMode}
          >
            <Minimize2 size={16} aria-hidden="true" />
            <span>{t('focus.exit')}</span>
            <kbd>Esc</kbd>
          </ShortcutButton>
        </div>
      )}
      <header className="app-header" data-tauri-drag-region inert={switching ? true : undefined}>
        {persistence.invoke && mac && <WindowControls mac />}
        <div className="main-menu-wrap" ref={menuWrap}>
          <ShortcutButton
            ref={menuButton}
            className="icon-button menu-trigger"
            label={t('menu.main')}
            keys="F10"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="main-menu"
            onClick={toggleMainMenu}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setMenuOpen(true)
              }
            }}
          >
            <Menu size={18} aria-hidden="true" />
          </ShortcutButton>
          {menuOpen && (
            <MainMenu
              firstRef={menuFirst}
              active={active}
              activePinned={data.pinnedIds?.includes(data.activeId)}
              prefs={prefs}
              sidebarVisible={sidebarVisible}
              trashCount={data.trash.length}
              desktop={Boolean(persistence.invoke)}
              actions={menuActions}
              onClose={closeMenu}
            />
          )}
        </div>
        <ShortcutButton
          className="icon-button sidebar-toggle"
          label={t('sidebar.toggle')}
          keys="Alt+B"
          aria-expanded={sidebarVisible}
          aria-controls="notes-sidebar"
          onClick={() => updatePrefs({ sidebarVisible: !sidebarVisible })}
        >
          <PanelLeft size={16} aria-hidden="true" />
        </ShortcutButton>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
          multiple
          hidden
          onChange={(event) => {
            addImages([...event.target.files], imagePoint.current ?? insertionPoint())
            event.target.value = ''
          }}
        />
        {tabStrip}
        <div className="window-drag-space" data-tauri-drag-region />
        <DisplayMenu
          prefs={prefs}
          onChange={updatePrefs}
          focusMode={focusMode}
          onToggleFocus={active ? toggleFocusMode : null}
        />
        {persistence.invoke && !mac && <WindowControls />}
        <input
          ref={importInput}
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          hidden
          onChange={(event) => {
            importFiles([...event.target.files])
            event.target.value = ''
          }}
        />
        <input
          ref={backupInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            restoreBackup(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </header>
      {tabContextMenu}
      <div className="workspace-layout" inert={switching ? true : undefined}>
        {sidebarVisible && (
          <aside
            id="notes-sidebar"
            className="notes-sidebar"
            aria-label={t('sidebar.title')}
            data-section={sidebarSection}
          >
            {sidebarSection === 'trash' ? (
              <div className="sidebar-heading">
                <ShortcutButton
                  className="icon-button"
                  label={t('trash.back')}
                  onClick={() => showSection('notes')}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </ShortcutButton>
                <span>{t('trash.title')}</span>
                <button
                  className="button quiet danger small"
                  disabled={!data.trash.length}
                  onClick={emptyTrash}
                >
                  {t('trash.emptyAll')}
                </button>
              </div>
            ) : (
              <div
                className="segmented sidebar-sections"
                data-index={SECTIONS.indexOf(sidebarSection)}
              >
                {SECTIONS.map((section) => {
                  const [label, Icon] = SECTION_LABELS[section]
                  return (
                    <button
                      key={section}
                      aria-pressed={sidebarSection === section}
                      onClick={() => showSection(section)}
                    >
                      <Icon size={14} aria-hidden="true" />
                      {t(label)}
                      {section === 'notes' && <span className="count">{data.notes.length}</span>}
                      {section === 'tasks' && openTasks > 0 && (
                        <span className="count">{openTasks}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="sidebar-search-row">
              <div className="search-field">
                <Search size={14} aria-hidden="true" />
                <input
                  ref={sidebarSearchRef}
                  aria-label={t(
                    sidebarSection === 'notes' ? 'sidebar.searchNotes' : 'sidebar.search',
                  )}
                  placeholder={t(
                    sidebarSection === 'notes' ? 'sidebar.searchNotes' : 'sidebar.search',
                  )}
                  value={sidebarQuery}
                  onChange={(event) => setSidebarQuery(event.target.value)}
                />
              </div>
              {sidebarSection === 'notes' && (
                <ShortcutButton
                  className="button sidebar-add"
                  label={t('menu.newNote')}
                  keys="T"
                  onClick={() => createNote()}
                >
                  <Plus size={15} aria-hidden="true" />
                </ShortcutButton>
              )}
              {sidebarSection === 'images' && (
                <ShortcutButton
                  className="button sidebar-add sidebar-add-image"
                  label={t('images.import')}
                  disabled={imageBusy}
                  onClick={pickImages}
                >
                  <Plus size={15} aria-hidden="true" />
                </ShortcutButton>
              )}
            </div>
            <div className="sidebar-items">
              {sidebarSection === 'notes' ? (
                <NoteList
                  notes={data.notes}
                  query={sidebarQuery}
                  activeId={active?.id}
                  openIds={data.openIds}
                  onOpen={previewNote}
                  onKeep={keepNote}
                  onSearchOpen={openNoteSearch}
                  onMenu={openTabMenu}
                />
              ) : sidebarSection === 'tasks' ? (
                <TasksLibrary
                  notes={data.notes}
                  query={sidebarQuery}
                  showDone={showDoneTasks}
                  onShowDone={setShowDoneTasks}
                  onToggle={toggleNoteTask}
                  onJump={jumpToTask}
                />
              ) : sidebarSection === 'trash' ? (
                <TrashLibrary
                  trash={data.trash}
                  query={sidebarQuery}
                  onRestore={restoreNote}
                  onPurge={purgeNote}
                />
              ) : (
                <ImageLibrary
                  images={images}
                  query={sidebarQuery}
                  busy={imageBusy}
                  loading={imagesLoading}
                  active={active}
                  activePinned={data.pinnedIds?.includes(data.activeId)}
                  notes={data.notes}
                  selected={selectedImage}
                  onSelect={setSelectedImage}
                  onInsert={(image) => insertMarkdown(markdownImage(image.name, image.src))}
                  onRename={renameImage}
                  onDelete={deleteImage}
                  onDownload={downloadImage}
                  onDeleteUnused={deleteUnusedImages}
                  onOpenNote={openNote}
                  onDropImage={(image, position) => {
                    if (blocked || switching || imageBusy || !active) return
                    const target = document.elementFromPoint(position.x, position.y)
                    if (!target?.closest('.editor-shell') || target.closest('.mode-switch')) return
                    insertMarkdown(
                      markdownImage(image.name, image.src),
                      insertionPoint({
                        dataTransfer: true,
                        clientX: position.x,
                        clientY: position.y,
                      }),
                    )
                  }}
                />
              )}
            </div>
            {sidebarSection !== 'trash' && (
              <div className="sidebar-footer">
                <button className="sidebar-trash" onClick={() => showSection('trash')}>
                  <Trash2 size={14} aria-hidden="true" />
                  {t('trash.title')}
                  {data.trash.length > 0 && <span className="count">{data.trash.length}</span>}
                </button>
              </div>
            )}
          </aside>
        )}
        <section
          className="editor-shell"
          tabIndex={-1}
          onMouseDownCapture={middleClickPasteGuard.mouse}
          onMouseUpCapture={middleClickPasteGuard.mouse}
          onAuxClickCapture={middleClickPasteGuard.mouse}
          onKeyDownCapture={(event) => {
            middleClickPasteGuard.keyboard()
            if (
              persistence.invoke &&
              (event.ctrlKey || event.metaKey) &&
              !event.shiftKey &&
              !event.altKey &&
              !event.isComposing &&
              event.key.toLowerCase() === 'v' &&
              event.target.closest?.('.cm-content, textarea')
            ) {
              event.preventDefault()
              event.stopPropagation()
              pasteNativeClipboard()
            }
          }}
          onPasteCapture={(event) => {
            if (middleClickPasteGuard.paste(event)) {
              pasteIntentGuard.reset()
              return
            }
            // Empty webview paste events are not permission to read the system
            // clipboard. Only the explicit keyboard handler does that.
            if (
              !document.hasFocus() ||
              document.visibilityState === 'hidden' ||
              (!clipboardImageFiles(event.clipboardData).length &&
                !event.clipboardData?.getData('text/plain'))
            ) {
              pasteIntentGuard.reset()
              event.preventDefault()
              event.stopPropagation()
              return
            }
            pasteIntentGuard.paste(event)
          }}
          onPaste={(event) => {
            if (event.defaultPrevented) return
            const files = clipboardImageFiles(event.clipboardData)
            if (files.length) {
              event.preventDefault()
              addImages(files)
            }
          }}
        >
          <WidthFeedback width={contentWidth(prefs)} mode={mode} />
          {active?.external && (
            <div className="external-bar">
              <span className="external-path" title={active.external.path}>
                {t('external.path', { path: active.external.path })}
              </span>
              <button type="button" onClick={() => copyExternalToNotes(active.id)}>
                {t('external.copy')}
              </button>
            </div>
          )}
          {active ? (
            <NoteViewport
              key={`${active.id}:${mode === 'source' ? 'source' : 'visual'}:${prefs.language}`}
              noteId={active.id}
              mode={mode === 'source' ? 'source' : 'visual'}
              positions={notePositions.current}
              visualRef={visualRef}
              editorRef={editorRef}
            >
              {mode === 'source' ? (
                <div className="source-editor-wrap">
                  <div className="source-search-mirror" aria-hidden="true">
                    <SourceSearchHighlights
                      body={active.body}
                      matches={findOpen ? findResult.matches : []}
                      index={findIndex}
                      scope={findOpen && findOptions.selectionOnly ? findOptions.scope : null}
                    />
                    {'\n'}
                  </div>
                  <textarea
                    ref={editorRef}
                    key={active.id}
                    aria-label={t('mode.sourceEditor')}
                    spellCheck="false"
                    value={active.body}
                    onChange={changeSource}
                    onFocus={(event) => {
                      const field = event.currentTarget
                      updateSelectionStatistics(
                        field.value.slice(field.selectionStart, field.selectionEnd),
                      )
                    }}
                    onSelect={(event) => {
                      const field = event.currentTarget
                      if (field.selectionStart < 2)
                        field.setSelectionRange(
                          2,
                          Math.max(2, field.selectionEnd),
                          field.selectionDirection,
                        )
                      updateSelectionStatistics(
                        field.value.slice(field.selectionStart, field.selectionEnd),
                      )
                    }}
                    onKeyDown={wrapSourceSelection}
                    onKeyUp={(event) => {
                      if (
                        event.shiftKey ||
                        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')
                      )
                        captureSearchSelection({
                          from: event.currentTarget.selectionStart,
                          to: event.currentTarget.selectionEnd,
                        })
                    }}
                    onPointerUp={(event) =>
                      captureSearchSelection({
                        from: event.currentTarget.selectionStart,
                        to: event.currentTarget.selectionEnd,
                      })
                    }
                    onScroll={(event) => {
                      const mirror = event.currentTarget.previousElementSibling
                      mirror.scrollTop = event.currentTarget.scrollTop
                      mirror.scrollLeft = event.currentTarget.scrollLeft
                    }}
                  />
                </div>
              ) : (
                <VisualEditor
                  notes={data.notes}
                  onCopy={copyCode}
                  imageBusy={imageBusy}
                  onImageFiles={addImages}
                  onImageUrl={(url, point) => insertMarkdown(markdownImage('Imagem', url), point)}
                  onOpenWiki={openWiki}
                  key={`${active.id}:${prefs.language}`}
                  noteId={active.id}
                  readOnly={mode === 'reading'}
                  body={active.body}
                  onChange={updateBody}
                  onSelectionChange={captureSearchSelection}
                  onStatisticsSelection={updateSelectionStatistics}
                  onReady={(view) => {
                    visualRef.current = view
                  }}
                />
              )}
            </NoteViewport>
          ) : (
            <div className="empty-note">{t('empty.note')}</div>
          )}
          <footer className="document-info">
            <ThemeSwitch className="footer-theme-switch" prefs={prefs} onChange={updatePrefs} />
            <span
              className="save-status"
              role="status"
              data-state={error ? 'error' : saving ? 'saving' : 'saved'}
            >
              {error ? t('save.notSaved') : saving ? t('save.saving') : ''}
            </span>

            {active && (
              <>
                {backlinks.length > 0 && (
                  <details className="backlinks">
                    <summary>{t('document.backlinks', { count: backlinks.length })}</summary>
                    <div className="backlinks-popover">
                      {backlinks.map((note) => (
                        <button key={note.id} onClick={() => openNote(note.id)}>
                          {displayName(note.name)}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
                {prefs.statusVisible !== false && selectionStats && (
                  <span
                    className="selection-statistics"
                    aria-label={t('document.selection')}
                    title={t('document.charactersNoSpaces', {
                      count: formatCount(selectionStats.charactersNoSpaces),
                    })}
                  >
                    <span>{t('document.selection')}:</span>
                    <span>{selectedCount('document.words', selectionStats.words)}</span>
                    <span>{selectedCount('document.characters', selectionStats.characters)}</span>
                    <span>{selectedCount('document.lines', selectionStats.lines)}</span>
                  </span>
                )}
                {prefs.statusVisible !== false && (
                  <span
                    className="document-statistics"
                    aria-label={t('document.total', {
                      words: wordCount,
                      characters: characterCount,
                    })}
                  >
                    <span>{t('document.words', { count: wordCount })}</span>
                    <span>{t('document.characters', { count: characterCount })}</span>
                  </span>
                )}
              </>
            )}
            <fieldset className="mode-switch">
              <legend className="sr-only">{t('mode.legend')}</legend>
              {[
                ['visual', t('mode.visual')],
                ['source', t('mode.source')],
                ['reading', t('mode.reading')],
              ].map(([value, label], index) => (
                <ShortcutHint key={value} label={label} keys={`Alt+${index + 1}`}>
                  <label>
                    <input
                      type="radio"
                      name="editor-mode"
                      value={value}
                      aria-label={label}
                      aria-description={shortcutText(`Alt+${index + 1}`)}
                      checked={mode === value}
                      onChange={() => changeMode(value)}
                    />
                    <ModeIcon mode={value} />
                    <span className="mode-label">{label}</span>
                  </label>
                </ShortcutHint>
              ))}
            </fieldset>
          </footer>
        </section>
      </div>
      {shortcutsOpen && (
        <ShortcutsDialog
          onClose={() => {
            setShortcutsOpen(false)
            menuButton.current?.focus()
          }}
        />
      )}
      {commandsOpen && (
        <CommandPalette
          commands={buildCommands({
            active,
            activePinned: data.pinnedIds?.includes(data.activeId),
            prefs,
            trashCount: data.trash.length,
            desktop: Boolean(persistence.invoke),
            mode,
          })
            .flatMap(([, entries]) => entries)
            .filter(([id]) => id !== 'commands')
            .map(([id, label, Icon, keys, disabled]) => ({
              id,
              label: t(label),
              Icon,
              keys,
              disabled: Boolean(disabled),
            }))}
          onRun={(id) => {
            setCommandsOpen(false)
            menuActions[id]?.()
          }}
          onClose={closeCommands}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          prefs={prefs}
          sidebarVisible={sidebarVisible}
          folder={persistence.kind === 'vault' ? persistence.label : ''}
          desktop={Boolean(persistence.invoke)}
          note={active}
          history={noteHistory}
          initialSection={settingsSection}
          onRestore={(body) => {
            noteHistory.record(
              { ...active, revision: active.revision + 1 },
              active.body,
              body,
              'restauracao',
            )
            updateBody(body)
            setSettingsOpen(false)
            focusEditor()
          }}
          onChange={updatePrefs}
          onRun={(id) => {
            setSettingsOpen(false)
            menuActions[id]?.()
          }}
          onClose={() => {
            setSettingsOpen(false)
            menuButton.current?.focus()
          }}
        />
      )}
      {palette && (
        <PaletteDialog
          inputRef={search}
          query={query}
          choices={choices}
          activeId={active?.id}
          selected={selected}
          onQuery={(value) => {
            setQuery(value)
            setSelected(0)
          }}
          onSelect={setSelected}
          onOpen={openNote}
          onClose={closePalette}
        />
      )}
      {conflict && (
        <ConflictDialog
          firstRef={conflictFirst}
          name={conflict.name}
          onResolve={resolveConflict}
          onClose={closeConflict}
        />
      )}
      {findOpen && (
        <FindDialog
          inputRef={findInput}
          replacementRef={replaceInput}
          query={findQuery}
          matchCount={findResult.matches.length}
          index={findIndex}
          error={findResult.error}
          options={findOptions}
          onOptions={(key) => {
            setFindOptions((options) => ({ ...options, [key]: !options[key] }))
            setFindIndex(0)
          }}
          replaceOpen={replaceOpen}
          onToggleReplace={() => setReplaceOpen((open) => !open)}
          replacement={replacement}
          onReplacement={setReplacement}
          onReplace={replaceFind}
          onQuery={(value) => {
            setFindQuery(value)
            setFindIndex(0)
          }}
          onStep={(step) => selectFind(findIndex + step)}
          onClose={closeFind}
        />
      )}
      {folderOpen && (
        <FolderDialog
          path={persistence.vault?.path ?? null}
          onChoose={chooseFolder}
          onUseAppStorage={useAppStorage}
          onClose={() => {
            setFolderOpen(false)
            setTimeout(() => menuButton.current?.focus(), 0)
          }}
        />
      )}
      {syncConflicts.length > 0 && !asking && (
        <SyncConflictDialog conflict={syncConflicts[0]} onResolve={resolveSync} />
      )}
      {asking?.kind === 'confirm' && (
        <ConfirmDialog
          message={asking.message}
          confirmLabel={asking.confirmLabel}
          cancelLabel={asking.cancelLabel}
          dismissLabel={asking.dismissLabel}
          single={asking.single}
          onAnswer={answer}
        />
      )}
      {asking?.kind === 'prompt' && (
        <PromptDialog label={asking.label} initial={asking.initial} onAnswer={answer} />
      )}
      <Toaster
        position="top-right"
        theme={prefs.theme}
        offset={{ top: 58, right: 16 }}
        visibleToasts={4}
        closeButton
        toastOptions={{
          classNames: { toast: 'app-toast' },
          closeButtonAriaLabel: t('dialog.close'),
        }}
      />
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  platform === 'mobile' ? <MobileShell /> : <App />,
)
