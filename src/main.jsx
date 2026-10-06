import { clipboardImageFiles, readNativeClipboard } from './clipboard.js'
import { listenNativeImageDrops, routeNativeImageDrop } from './native-image-drop.js'
import { ensureTitle, ensureDocumentTitles, titlePosition, titleNavigationTarget } from './title.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'sonner'
import { Markdown } from './markdown.jsx'
import { createFullBackup, readBackupBundle, restoreBackupImages } from './backup.js'
import {
  findNote,
  wikiParts,
  renameWikiReferences,
  normalizeImageSource,
} from './markdown-model.js'
import { FONT_SIZE } from './storage.js'
import { NoteList } from './components/note-list.jsx'
import { friendlyError } from './errors.js'
import { ToastButtons } from './components/toast-buttons.jsx'
import { CommandPalette } from './components/command-palette.jsx'
import { SettingsDialog } from './components/settings-dialog.jsx'
import { buildCommands } from './commands.js'
import { MainMenu } from './components/main-menu.jsx'
import { useTabs } from './components/tabs.jsx'
import { ImageLibrary } from './components/image-library.jsx'
import { readNoteFile, splitDrop } from './note-drop.js'
import { appShortcut } from './shortcuts.js'
import { findMatches } from './find.js'
import {
  headingFileName,
  isDiscardableEmptyNote,
  moveToTrash,
  nameFromHeading,
  purgeFromTrash,
  restoreFromTrash,
  uniqueName,
} from './notes.js'
import { openWorkspace } from './boot.js'
import { createAppPersistence } from './persistence-runtime.js'
import { VAULT_DISCONNECT, connectVault } from './persistence-vault.js'
import { createWriteQueue } from './write-queue.js'
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
  TrashDialog,
} from './components/dialogs.jsx'
import { setLanguage, t } from './i18n.js'
import { wrapSelection } from './wrap-selection.js'
import { continueBlock } from './continue-block.js'
import { restoreWindowState } from './window-state.js'
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
} from 'lucide-react'
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
  const current = useRef(loaded.document)
  const [data, setData] = useState(loaded.document)
  const [error, setError] = useState(loaded.error)
  const [blocked, setBlocked] = useState(loaded.blocked)
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [sidebarSection, setSidebarSection] = useState('notes')
  const [diskImages, setDiskImages] = useState([])
  const [imageVersion, setImageVersion] = useState(0)
  const [imagesLoading, setImagesLoading] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const imageInput = useRef(null)
  const imagePoint = useRef(null)
  const [mode, setMode] = useState('visual')
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [importError, setImportError] = useState('')
  const [folderError, setFolderError] = useState('')
  const [folderOpen, setFolderOpen] = useState(false)
  const [asking, setAsking] = useState(null)
  const [syncConflicts, setSyncConflicts] = useState([])
  const [conflict, setConflict] = useState(null)
  const conflictRef = useRef(null)
  const conflictQueue = useRef([])
  const [trashOpen, setTrashOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const damaged = useRef(loaded.raw)
  const writer = useRef(null)
  if (!writer.current)
    writer.current = createWriteQueue((document) => persistence.save(document), setError, setSaving)
  const search = useRef(null)
  const conflictFirst = useRef(null)
  const importInput = useRef(null)
  const backupInput = useRef(null)
  const menuButton = useRef(null)
  const menuWrap = useRef(null)
  const menuFirst = useRef(null)
  const findInput = useRef(null)
  const editorRef = useRef(null)
  const visualRef = useRef(null)
  const closedTabs = useRef([])
  const clipboardBusy = useRef(false)
  const trashFirst = useRef(null)
  const returnFocus = useRef(null)
  const active = data.notes.find((note) => note.id === data.activeId) ?? null
  const choices = data.notes.filter((note) =>
    note.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  const prefs = data.preferences
  const { tabStrip, tabContextMenu, openTabMenu } = useTabs({
    data,
    current,
    commit,
    tabsVisible: prefs.tabsVisible,
    open: openNote,
    rename: renameNote,
    close: closeTab,
    trash: deleteNote,
  })
  const sidebarVisible = prefs.sidebarVisible ?? !window.matchMedia('(max-width: 600px)').matches
  setLanguage(prefs.language)
  const images = useMemo(() => libraryImages(data, diskImages), [data, diskImages])

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
  function commit(next) {
    next = ensureDocumentTitles(next)
    current.current = next
    setData(next)
    if (!blocked) writer.current.write(next)
  }
  function updatePrefs(change) {
    commit({ ...current.current, preferences: { ...current.current.preferences, ...change } })
  }
  function focusEditor() {
    if (mode === 'source') editorRef.current?.focus()
    else visualRef.current?.focus()
  }
  function openNote(id) {
    const old = current.current
    commit({
      ...old,
      openIds: old.openIds.includes(id) ? old.openIds : [...old.openIds, id],
      activeId: id,
      preferences: window.matchMedia('(max-width: 600px)').matches
        ? { ...old.preferences, sidebarVisible: false }
        : old.preferences,
    })
    if (mode === 'reading') setMode('visual')
    if (palette) closePalette()
    setTimeout(focusEditor, 0)
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
  function createNote(name = 'new note.md', body = '') {
    const blank = !body
    body = ensureTitle(body, name.replace(/\.md$/i, ''))
    const old = current.current
    const note = {
      id: crypto.randomUUID(),
      name: uniqueName(old.notes, headingFileName(body) ?? name),
      body,
      revision: 0,
    }
    commit({
      ...old,
      notes: [...old.notes, note],
      openIds: [...old.openIds, note.id],
      activeId: note.id,
    })
    if (mode === 'reading') setMode('visual')
    if (palette) closePalette()
    setTimeout(() => {
      focusEditor()
      if (blank) {
        const end = note.body.split('\n')[0].length
        if (mode === 'source') editorRef.current?.setSelectionRange(2, end)
        else visualRef.current?.dispatch({ selection: { anchor: 2, head: end } })
      }
    }, 0)
  }
  function updateBody(body) {
    body = ensureTitle(body)
    const old = current.current
    const name = nameFromHeading(body, old.notes, old.activeId)
    const previousName = old.notes.find((note) => note.id === old.activeId)?.name
    const rewrite = (note) => {
      const active = note.id === old.activeId
      const content = active ? body : note.body
      const nextBody =
        name && previousName && name !== previousName
          ? renameWikiReferences(content, previousName, name)
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
    if (raw !== normalized) requestAnimationFrame(() => field.setSelectionRange(from, to))
  }
  function wrapSourceSelection(event) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    const field = event.currentTarget
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
  function closeTab(id) {
    const old = current.current
    if (!old.openIds.includes(id) || old.pinnedIds?.includes(id)) return
    const note = old.notes.find((item) => item.id === id)
    const openIds = old.openIds.filter((item) => item !== id)
    const notes =
      note && isDiscardableEmptyNote(note) ? old.notes.filter((item) => item.id !== id) : old.notes
    if (note)
      closedTabs.current.push({
        id,
        index: old.openIds.indexOf(id),
        discarded: notes.includes(note) ? null : note,
      })
    commit({
      ...old,
      notes,
      openIds,
      activeId: old.activeId === id ? (openIds.at(-1) ?? null) : old.activeId,
    })
  }
  function reopenTab() {
    while (closedTabs.current.length) {
      const entry = closedTabs.current.pop()
      const old = current.current
      if (old.openIds.includes(entry.id) || old.trash.some(({ note }) => note.id === entry.id))
        continue
      const note = old.notes.find((note) => note.id === entry.id) ?? entry.discarded
      if (!note) continue
      const openIds = [...old.openIds]
      openIds.splice(Math.max(old.pinnedIds?.length ?? 0, entry.index), 0, note.id)
      commit({
        ...old,
        notes: old.notes.some((item) => item.id === note.id)
          ? old.notes
          : [...old.notes, { ...note, name: uniqueName(old.notes, note.name) }],
        openIds,
        activeId: note.id,
      })
      setTimeout(focusEditor, 0)
      return
    }
  }
  function selectAdjacentTab(direction) {
    const { openIds, activeId } = current.current
    if (!openIds.length) return
    const index = openIds.indexOf(activeId)
    openNote(openIds[(index + direction + openIds.length) % openIds.length])
  }
  async function renameNote(id = active?.id) {
    const note = data.notes.find((item) => item.id === id)
    if (!note) return
    const proposed = (
      await ask({ kind: 'prompt', label: t('dialog.renameLabel'), initial: note.name })
    )?.trim()
    if (!proposed || proposed === note.name) return
    const name = proposed.toLowerCase().endsWith('.md') ? proposed : `${proposed}.md`
    if (
      current.current.notes.some(
        (item) => item.id !== id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      await ask({ kind: 'confirm', single: true, message: t('error.nameExists') })
      return
    }
    const body = note.body.replace(/^# [ \t]*(.+?)[ \t]*$/m, `# ${name.slice(0, -3)}`)
    commit({
      ...current.current,
      trash: current.current.trash.map((entry) => {
        const body = renameWikiReferences(entry.note.body, note.name, name)
        return body === entry.note.body
          ? entry
          : { ...entry, note: { ...entry.note, body, revision: entry.note.revision + 1 } }
      }),
      notes: current.current.notes.map((item) =>
        (() => {
          const nextBody = renameWikiReferences(item.id === id ? body : item.body, note.name, name)
          return item.id === id || nextBody !== item.body
            ? {
                ...item,
                name: item.id === id ? name : item.name,
                body: nextBody,
                revision: item.revision + 1,
              }
            : item
        })(),
      ),
    })
  }
  async function deleteNote(id = active?.id) {
    const note = data.notes.find((item) => item.id === id)
    if (!note) return
    const confirmed = await ask({
      kind: 'confirm',
      message: t('dialog.moveToTrash', { name: note.name }),
      confirmLabel: t('dialog.moveToTrashConfirm'),
    })
    if (!confirmed) return
    commit(moveToTrash(current.current, id, Date.now()))
  }
  function restoreNote(id) {
    commit(restoreFromTrash(current.current, id))
    if (mode === 'reading') setMode('visual')
    closeTrash()
  }
  async function purgeNote(id) {
    const note = data.trash.find((entry) => entry.note.id === id)?.note
    if (!note) return
    const confirmed = await ask({
      kind: 'confirm',
      message: t('dialog.purge', { name: note.name }),
      confirmLabel: t('dialog.purgeConfirm'),
    })
    if (confirmed) commit(purgeFromTrash(current.current, id))
  }
  function closeTrash() {
    setTrashOpen(false)
    setTimeout(() => menuButton.current?.focus(), 0)
  }
  async function importFiles(files) {
    setImportError('')
    for (const file of files) {
      try {
        const body = await readNoteFile(file, persistence.invoke)
        const name =
          headingFileName(body) ??
          (file.name.toLowerCase().endsWith('.md') ? file.name : `${file.name}.md`)
        const existing = current.current.notes.find(
          (note) => note.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
        if (!existing) createNote(name, body)
        else if (conflictRef.current) conflictQueue.current.push({ name, body, id: existing.id })
        else openConflict({ name, body, id: existing.id })
      } catch (cause) {
        setImportError(friendlyError(cause, t('error.readFile')))
      }
    }
  }
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
  const nativeDropHandler = useRef(null)
  nativeDropHandler.current = (dropped, position) => {
    const { notes, others } = splitDrop(dropped)
    if (notes.length && !blocked && !switching) importFiles(notes)
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
    if (clipboardBusy.current || imageBusy || blocked || switching || !active) return
    const point = insertionPoint()
    const noteId = active.id
    const editorMode = mode
    const view = visualRef.current
    const field = editorRef.current
    clipboardBusy.current = true
    setImportError('')
    try {
      const contents = await readNativeClipboard(persistence.invoke)
      if (contents?.kind === 'image') {
        await addImages(contents.files, point, noteId)
      } else if (contents?.kind === 'text' && current.current.activeId === noteId) {
        if (editorMode === 'visual' && view === visualRef.current) {
          view.focus()
          view.dispatch({ selection: { anchor: point.from, head: point.to } })
          const clipboardData = new DataTransfer()
          clipboardData.setData('text/plain', contents.text)
          view.contentDOM.dispatchEvent(
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
    setImageBusy(true)
    setImportError('')
    toast.dismiss('image-delete')
    try {
      const failure = await writer.current.whenIdle()
      if (failure) throw new Error(failure)
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
    if (sidebarSection !== 'images' || !persistence.invoke) return
    let stopped = false
    setImagesLoading(true)
    persistence
      .invoke('image_list')
      .then((names) => {
        if (!stopped) setDiskImages(names.map((src) => ({ src, name: src.split('/').at(-1) })))
      })
      .catch((cause) => {
        if (!stopped) setImportError(String(cause))
      })
      .finally(() => {
        if (!stopped) setImagesLoading(false)
      })
    return () => {
      stopped = true
    }
  }, [sidebarSection, imageVersion, persistence])
  function resolveSync(choice) {
    const [conflict, ...rest] = syncConflicts
    setSyncConflicts(rest)
    commit(persistence.sync.resolve(current.current, conflict, choice))
  }
  async function downloadBackup() {
    try {
      download(
        'sloth-note-backup.json',
        await createFullBackup(current.current, persistence.invoke),
        'application/json;charset=utf-8',
      )
    } catch (cause) {
      setImportError(String(cause.message ?? cause))
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
      setTrashOpen(false)
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
    if (restoreFocus) setTimeout(() => menuButton.current?.focus(), 0)
  }
  function openFind() {
    setMenuOpen(false)
    if (mode === 'reading') setMode('visual')
    setFindOpen(true)
    setFindIndex(0)
    setTimeout(() => findInput.current?.focus(), 0)
  }
  function closeFind() {
    setFindOpen(false)
    setTimeout(focusEditor, 0)
  }
  function currentMatches() {
    return active ? findMatches(active.body, findQuery) : []
  }
  function selectFind(index = findIndex) {
    const matches = currentMatches()
    if (!matches.length) return
    const safeIndex = (index + matches.length) % matches.length
    if (mode === 'source' && editorRef.current) {
      editorRef.current.focus()
      editorRef.current.setSelectionRange(matches[safeIndex].start, matches[safeIndex].end)
    } else if (visualRef.current) {
      visualRef.current.dispatch({
        selection: { anchor: matches[safeIndex].start, head: matches[safeIndex].end },
        scrollIntoView: true,
      })
    }
    findInput.current?.focus()
    setFindIndex(safeIndex)
  }
  function runMenu(action, restoreFocus = true) {
    setMenuOpen(false)
    action()
    if (restoreFocus) setTimeout(() => menuButton.current?.focus(), 0)
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
        await writer.current.whenIdle()
        const files = await sync.scan()
        if (files === null || stopped) return
        const result = sync.merge(current.current, files)
        if (result.changed) commit(result.document)
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
  const toastActions = useRef({})
  toastActions.current = {
    downloadBackup,
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
    toast.error(t('error.storage', { error, label: persistence.label }), {
      id: 'storage',
      duration: Infinity,
      description: (
        <ToastButtons
          items={[
            [t('menu.backupDownload'), run('downloadBackup')],
            ...(blocked && damaged.current !== null
              ? [[t('error.downloadStored'), run('downloadDamaged')]]
              : []),
            ...(blocked ? [[t('error.replaceStorage'), run('resetDamagedStorage')]] : []),
          ]}
        />
      ),
    })
  }, [error, blocked, persistence.label])
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
    if (trashOpen) trashFirst.current?.focus()
  }, [trashOpen])
  useEffect(() => {
    if (trashOpen && document.activeElement === document.body) trashFirst.current?.focus()
  }, [trashOpen, data.trash.length])
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
      if (trashOpen) {
        if (event.key === 'Escape') closeTrash()
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
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  const menuActions = {
    newNote: () => runMenu(() => createNote(), false),
    findNote: () => runMenu(openPalette, false),
    findInNote: () => active && runMenu(openFind, false),
    rename: () => active && runMenu(renameNote, false),
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
    trash: () => runMenu(() => setTrashOpen(true), false),
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
    language: () =>
      runMenu(() => updatePrefs({ language: prefs.language === 'en' ? 'pt-BR' : 'en' })),
    shortcuts: () => runMenu(() => setShortcutsOpen(true), false),
    settings: () => runMenu(() => setSettingsOpen(true), false),
    commands: () =>
      runMenu(() => {
        returnFocus.current = document.activeElement
        setCommandsOpen(true)
      }, false),
  }
  return (
    <main
      className="app"
      style={{ '--editor-size': `${prefs.fontSize}px` }}
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
      <header className="app-header" inert={switching ? true : undefined}>
        <div className="main-menu-wrap" ref={menuWrap}>
          <button
            ref={menuButton}
            className="icon-button menu-trigger"
            aria-label={t('menu.main')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="main-menu"
            onClick={() => setMenuOpen((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setMenuOpen(true)
              }
            }}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          {menuOpen && (
            <MainMenu
              firstRef={menuFirst}
              active={active}
              activePinned={data.pinnedIds?.includes(data.activeId)}
              prefs={prefs}
              mode={mode}
              sidebarVisible={sidebarVisible}
              trashCount={data.trash.length}
              desktop={Boolean(persistence.invoke)}
              actions={menuActions}
              onClose={closeMenu}
            />
          )}
        </div>
        <span className="app-title">Sloth Note</span>
        <button
          className="icon-button sidebar-toggle"
          title={t('sidebar.toggle')}
          aria-label={t('sidebar.toggle')}
          aria-expanded={sidebarVisible}
          aria-controls="notes-sidebar"
          onClick={() => updatePrefs({ sidebarVisible: !sidebarVisible })}
        >
          <PanelLeft size={16} />
        </button>
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
        <span
          className="save-status"
          role="status"
          data-state={error ? 'error' : saving ? 'saving' : 'saved'}
        >
          {error ? t('save.notSaved') : saving ? t('save.saving') : t('save.saved')}
        </span>
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
          <aside id="notes-sidebar" className="notes-sidebar" aria-label={t('sidebar.title')}>
            <div className="sidebar-heading">
              <span>{t('sidebar.title')}</span>
              <button
                className="icon-button"
                aria-label={t('menu.newNote')}
                title={t('menu.newNote')}
                onClick={() => createNote()}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="segmented">
              <button
                aria-pressed={sidebarSection === 'notes'}
                onClick={() => setSidebarSection('notes')}
              >
                {t('menu.notes')} <span className="count">{data.notes.length}</span>
              </button>
              <button
                aria-pressed={sidebarSection === 'images'}
                onClick={() => setSidebarSection('images')}
              >
                <ImageIcon size={14} />
                {t('images.title')}
              </button>
            </div>
            <div className="search-field">
              <Search size={14} aria-hidden="true" />
              <input
                aria-label={t('sidebar.search')}
                placeholder={t('sidebar.search')}
                value={sidebarQuery}
                onChange={(event) => setSidebarQuery(event.target.value)}
              />
            </div>
            <div className="sidebar-items">
              {sidebarSection === 'notes' ? (
                <NoteList
                  notes={data.notes}
                  query={sidebarQuery}
                  activeId={active?.id}
                  openIds={data.openIds}
                  onOpen={openNote}
                  onMenu={openTabMenu}
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
                  onImport={pickImages}
                  onRefresh={refreshImages}
                  onInsert={(image) => insertMarkdown(markdownImage(image.name, image.src))}
                  onRename={renameImage}
                  onDelete={deleteImage}
                  onDownload={downloadImage}
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
          </aside>
        )}
        <section
          className="editor-shell"
          onKeyDownCapture={(event) => {
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
            if (
              persistence.invoke &&
              !clipboardBusy.current &&
              event.target.closest?.('.cm-content, textarea') &&
              !clipboardImageFiles(event.clipboardData).length &&
              !event.clipboardData.getData('text/plain')
            ) {
              event.preventDefault()
              event.stopPropagation()
              pasteNativeClipboard()
            }
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
          <fieldset className="mode-switch">
            <legend className="sr-only">{t('mode.legend')}</legend>
            {[
              ['visual', t('mode.visual')],
              ['source', t('mode.source')],
              ['reading', t('mode.reading')],
            ].map(([value, label]) => (
              <label key={value} title={label}>
                <input
                  type="radio"
                  name="editor-mode"
                  value={value}
                  aria-label={label}
                  checked={mode === value}
                  onChange={() => changeMode(value)}
                />
                <ModeIcon mode={value} />
                <span className="mode-label">{label}</span>
              </label>
            ))}
          </fieldset>
          {active ? (
            mode === 'reading' ? (
              <div className="reading">
                <Markdown
                  text={active.body}
                  onCopy={copyCode}
                  onChange={updateBody}
                  onOpenWiki={openWiki}
                  notes={data.notes}
                />
              </div>
            ) : mode === 'source' ? (
              <textarea
                ref={editorRef}
                key={active.id}
                aria-label={t('mode.sourceEditor')}
                spellCheck="false"
                value={active.body}
                onChange={changeSource}
                onSelect={(event) => {
                  const field = event.currentTarget
                  if (field.selectionStart < 2)
                    field.setSelectionRange(
                      2,
                      Math.max(2, field.selectionEnd),
                      field.selectionDirection,
                    )
                }}
                onKeyDown={wrapSourceSelection}
              />
            ) : (
              <VisualEditor
                imageBusy={imageBusy}
                onImageFiles={addImages}
                onImageUrl={(url, point) => insertMarkdown(markdownImage('Imagem', url), point)}
                onOpenWiki={openWiki}
                key={`${active.id}:${prefs.language}`}
                noteId={active.id}
                body={active.body}
                onChange={updateBody}
                onReady={(view) => {
                  visualRef.current = view
                }}
              />
            )
          ) : (
            <div className="empty-note">{t('empty.note')}</div>
          )}
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
      {trashOpen && (
        <TrashDialog
          firstRef={trashFirst}
          trash={data.trash}
          onRestore={restoreNote}
          onPurge={purgeNote}
          onClose={closeTrash}
        />
      )}
      {findOpen && (
        <FindDialog
          inputRef={findInput}
          query={findQuery}
          matchCount={currentMatches().length}
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
        toastOptions={{ classNames: { toast: 'app-toast' } }}
      />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
