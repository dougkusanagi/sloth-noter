import { listenNativeImageDrops, routeNativeImageDrop } from './native-image-drop.js'
import { ensureTitle, ensureDocumentTitles } from './title.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Markdown } from './markdown.jsx'
import { createFullBackup, readBackupBundle, restoreBackupImages } from './backup.js'
import { findNote, wikiParts, renameWikiReferences } from './markdown-model.js'
import { MainMenu } from './components/main-menu.jsx'
import { ImageLibrary } from './components/image-library.jsx'
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
  resolveImage,
  allNotes,
  clearImageCache,
  markdownImage,
  replaceDocumentImage,
  dataUrlBytes,
} from './images.js'
import { BookOpen, Code, Eye, PanelLeft, X, Plus, Menu, Image as ImageIcon } from 'lucide-react'
import './styles.css'

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

function Shortcut({ letter }) {
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
  return (
    <span className="menu-shortcut" aria-label={`${modifier}+${letter}`}>
      <kbd>{modifier}</kbd>
      <span>+</span>
      <kbd>{letter}</kbd>
    </span>
  )
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
        if (!cancelled)
          setFailure(cause instanceof Error ? cause.message : 'storage is unavailable')
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
  const [switching, setSwitching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const imageInput = useRef(null)
  const imagePoint = useRef(null)
  const [mode, setMode] = useState('visual')
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const [importError, setImportError] = useState('')
  const [folderError, setFolderError] = useState('')
  const [folderOpen, setFolderOpen] = useState(false)
  const [asking, setAsking] = useState(null)
  const [syncConflicts, setSyncConflicts] = useState([])
  const [conflict, setConflict] = useState(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [tabMenu, setTabMenu] = useState(null)
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
  const tabListRef = useRef(null)
  const activeTabRef = useRef(null)
  const tabMenuFirst = useRef(null)
  const trashFirst = useRef(null)
  const returnFocus = useRef(null)
  const active = data.notes.find((note) => note.id === data.activeId) ?? null
  const choices = data.notes.filter((note) =>
    note.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  const prefs = data.preferences
  const sidebarVisible = prefs.sidebarVisible ?? !window.matchMedia('(max-width: 600px)').matches
  setLanguage(prefs.language)
  const images = useMemo(() => {
    const found = new Map(
      noteImages([...data.notes, ...data.trash.map((entry) => entry.note)]).map((image) => [
        image.src,
        image,
      ]),
    )
    for (const asset of [...diskImages, ...(data.assets ?? [])]) {
      const previous = found.get(asset.src)
      found.set(asset.src, { ...asset, noteIds: previous?.noteIds ?? [] })
    }
    return [...found.values()]
  }, [data.notes, data.trash, data.assets, diskImages])

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
    const delta = normalized.length - raw.length
    const from = Math.max(2, field.selectionStart + delta)
    const to = Math.max(2, field.selectionEnd + delta)
    updateBody(normalized)
    if (delta) requestAnimationFrame(() => field.setSelectionRange(from, to))
  }
  function wrapSourceSelection(event) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
    const field = event.currentTarget
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
    const note = old.notes.find((item) => item.id === id)
    const openIds = old.openIds.filter((item) => item !== id)
    const notes =
      note && isDiscardableEmptyNote(note) ? old.notes.filter((item) => item.id !== id) : old.notes
    commit({
      ...old,
      notes,
      openIds,
      activeId: old.activeId === id ? (openIds.at(-1) ?? null) : old.activeId,
    })
  }
  function openTabMenu(event, id) {
    event.preventDefault()
    event.stopPropagation()
    setTabMenu({
      id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 220)),
    })
  }
  function runTabMenu(action) {
    const menu = tabMenu
    if (!menu || !current.current.notes.some((note) => note.id === menu.id)) return
    setTabMenu(null)
    if (action === 'open') openNote(menu.id)
    if (action === 'rename') renameNote(menu.id)
    if (action === 'close') closeTab(menu.id)
    if (action === 'trash') deleteNote(menu.id)
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
  async function importFile(file) {
    if (!file) return
    setImportError('')
    try {
      const body = await file.text()
      const name =
        headingFileName(body) ??
        (file.name.toLowerCase().endsWith('.md') ? file.name : `${file.name}.md`)
      const existing = current.current.notes.find(
        (note) => note.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
      if (existing) setConflict({ name, body, id: existing.id })
      else createNote(name, body)
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : t('error.readFile'))
    }
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
      setFolderError(cause instanceof Error ? cause.message : String(cause))
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
  nativeDropHandler.current = (files, position) =>
    routeNativeImageDrop(files, position, (files, point) =>
      addImages(files, insertionPoint({ dataTransfer: true, clientX: point.x, clientY: point.y })),
    )
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
  async function addImages(files, point = insertionPoint()) {
    if (imageBusy || blocked || switching) return
    const noteId = active?.id
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
    try {
      await writer.current.whenIdle()
      if (persistence.invoke) await persistence.invoke('image_delete', { name: image.src })
      commit({
        ...current.current,
        assets: (current.current.assets ?? []).filter((asset) => asset.src !== image.src),
      })
      setSelectedImage(null)
      refreshImages()
    } catch (cause) {
      setImportError(String(cause.message ?? cause))
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
      setImportError(cause instanceof Error ? cause.message : t('error.readBackup'))
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
    setConflict(null)
    setTimeout(() => menuButton.current?.focus(), 0)
  }
  async function copyCode(source) {
    try {
      await navigator.clipboard.writeText(source)
      setCopyStatus(t('code.copied'))
    } catch {
      setCopyStatus(t('code.copyFailed'))
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
        setFolderError(cause instanceof Error ? cause.message : String(cause))
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
    const list = tabListRef.current,
      tab = activeTabRef.current
    if (!list || !tab) return
    const showActiveTab = () => {
      const listBox = list.getBoundingClientRect(),
        tabBox = tab.getBoundingClientRect()
      if (tabBox.left < listBox.left) list.scrollLeft += tabBox.left - listBox.left
      else if (tabBox.right > listBox.right) list.scrollLeft += tabBox.right - listBox.right
    }
    showActiveTab()
    const observer = new ResizeObserver(showActiveTab)
    observer.observe(list)
    window.addEventListener('resize', showActiveTab)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', showActiveTab)
    }
  }, [data.activeId, data.openIds, prefs.tabsVisible])
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
    if (!tabMenu) return
    const onPointer = (event) => {
      if (!event.target.closest('.tab-context-menu')) setTabMenu(null)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setTabMenu(null)
      }
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    const frame = requestAnimationFrame(() => tabMenuFirst.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [tabMenu])
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
      if (asking || folderOpen || shortcutsOpen || selectedImage || switching) return
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const action = appShortcut(event)
      if (action && menuActions[action]) {
        event.preventDefault()
        menuActions[action]()
        return
      }
      if (modifier && (event.key === '+' || event.code === 'Equal')) {
        event.preventDefault()
        updatePrefs({ fontSize: Math.min(24, prefs.fontSize + 1) })
      }
      if (modifier && (event.key === '-' || event.code === 'Minus')) {
        event.preventDefault()
        updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) })
      }
      if (modifier && key === '0') {
        event.preventDefault()
        updatePrefs({ fontSize: 18 })
      }
      if (event.key === 'Escape' && palette) closePalette()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const menuActions = {
    newNote: () => runMenu(() => createNote(), false),
    findNote: () => runMenu(openPalette, false),
    findInNote: () => active && runMenu(openFind, false),
    rename: () => active && runMenu(renameNote, false),
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
    sidebar: () => runMenu(() => updatePrefs({ sidebarVisible: !sidebarVisible })),
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
    smaller: () => runMenu(() => updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) })),
    larger: () => runMenu(() => updatePrefs({ fontSize: Math.min(24, prefs.fontSize + 1) })),
    language: () =>
      runMenu(() => updatePrefs({ language: prefs.language === 'en' ? 'pt-BR' : 'en' })),
    shortcuts: () => runMenu(() => setShortcutsOpen(true), false),
  }
  return (
    <main className="app" style={{ '--editor-size': `${prefs.fontSize}px` }}>
      <header className="app-header" inert={switching ? true : undefined}>
        <div className="main-menu-wrap" ref={menuWrap}>
          <button
            ref={menuButton}
            className="menu-trigger"
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
          className="sidebar-toggle"
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
        {prefs.tabsVisible && data.openIds.length > 0 && (
          <nav className="tabs" aria-label={t('tabs.label')}>
            <div className="tab-list" ref={tabListRef}>
              {data.openIds.map((id) => {
                const note = data.notes.find((item) => item.id === id)
                return (
                  note && (
                    <div
                      key={id}
                      ref={id === data.activeId ? activeTabRef : null}
                      className={id === data.activeId ? 'tab-wrap active' : 'tab-wrap'}
                    >
                      <button
                        title={note.name}
                        className={id === data.activeId ? 'tab active' : 'tab'}
                        aria-haspopup="menu"
                        aria-expanded={tabMenu?.id === id}
                        onClick={() => openNote(id)}
                        onAuxClick={(event) => {
                          if (event.button === 1) {
                            event.preventDefault()
                            closeTab(id)
                          }
                        }}
                        onContextMenu={(event) => openTabMenu(event, id)}
                        onMouseDown={(event) => {
                          if (event.button === 1) event.preventDefault()
                        }}
                      >
                        <span>{note.name}</span>
                      </button>
                      <button
                        className="tab-close"
                        aria-label={`${t('tabs.close')}: ${note.name}`}
                        title={t('tabs.close')}
                        onClick={() => closeTab(id)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )
                )
              })}
            </div>
          </nav>
        )}
        <span className="save-status" role="status">
          {error ? t('save.notSaved') : saving ? t('save.saving') : t('save.saved')}
        </span>
        <input
          ref={importInput}
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          hidden
          onChange={(event) => {
            importFile(event.target.files?.[0])
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
      {tabMenu && (
        <div
          className="tab-context-menu"
          role="menu"
          aria-label={t('tabs.menu')}
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onKeyDown={(event) => {
            const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
            const index = buttons.indexOf(document.activeElement)
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              buttons[
                (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
              ]?.focus()
            }
            if (event.key === 'Home') {
              event.preventDefault()
              buttons[0]?.focus()
            }
            if (event.key === 'End') {
              event.preventDefault()
              buttons.at(-1)?.focus()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setTabMenu(null)
            }
          }}
        >
          <button
            ref={tabMenuFirst}
            type="button"
            role="menuitem"
            onClick={() => runTabMenu('open')}
          >
            <span>{t('tabs.open')}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => runTabMenu('rename')}>
            <span>{t('tabs.rename')}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => runTabMenu('close')}>
            <span>{t('tabs.close')}</span>
            <Shortcut letter="W" />
          </button>
          <div className="table-context-menu-separator" />
          <button type="button" role="menuitem" onClick={() => runTabMenu('trash')}>
            <span>{t('tabs.trash')}</span>
          </button>
        </div>
      )}
      <div className="workspace-layout" inert={switching ? true : undefined}>
        {sidebarVisible && (
          <aside id="notes-sidebar" className="notes-sidebar" aria-label={t('sidebar.title')}>
            <div className="sidebar-heading">
              <span>{t('sidebar.title')}</span>
              <button
                aria-label={t('menu.newNote')}
                title={t('menu.newNote')}
                onClick={() => createNote()}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="sidebar-sections">
              <button
                aria-pressed={sidebarSection === 'notes'}
                onClick={() => setSidebarSection('notes')}
              >
                {t('menu.notes')} <span>{data.notes.length}</span>
              </button>
              <button
                aria-pressed={sidebarSection === 'images'}
                onClick={() => setSidebarSection('images')}
              >
                <ImageIcon size={14} />
                {t('images.title')}
              </button>
            </div>
            <input
              className="sidebar-search"
              aria-label={t('sidebar.search')}
              placeholder={t('sidebar.search')}
              value={sidebarQuery}
              onChange={(event) => setSidebarQuery(event.target.value)}
            />
            <div className="sidebar-items">
              {sidebarSection === 'notes' &&
                !data.notes.some((note) =>
                  note.name.toLocaleLowerCase().includes(sidebarQuery.toLocaleLowerCase()),
                ) && <p className="sidebar-empty">{t('library.noResults')}</p>}
              {sidebarSection === 'notes' ? (
                data.notes
                  .filter((note) =>
                    note.name.toLocaleLowerCase().includes(sidebarQuery.toLocaleLowerCase()),
                  )
                  .map((note) => (
                    <button
                      key={note.id}
                      className="sidebar-note"
                      title={note.name}
                      aria-current={note.id === active?.id ? 'page' : undefined}
                      onClick={() => openNote(note.id)}
                      onContextMenu={(event) => openTabMenu(event, note.id)}
                    >
                      {note.name.replace(/\.md$/i, '')}
                    </button>
                  ))
              ) : (
                <ImageLibrary
                  images={images}
                  query={sidebarQuery}
                  busy={imageBusy}
                  loading={imagesLoading}
                  active={active}
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
                />
              )}
            </div>
          </aside>
        )}
        <section
          className="editor-shell"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault()
          }}
          onDropCapture={(event) => {
            if (event.target.closest?.('.image-insert')) return
            if (event.dataTransfer.files.length) {
              event.preventDefault()
              event.stopPropagation()
              addImages([...event.dataTransfer.files], insertionPoint(event))
            }
          }}
          onPaste={(event) => {
            const files = [...event.clipboardData.files].filter((file) =>
              file.type.startsWith('image/'),
            )
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
          {error && (
            <div className="save-error" role="alert">
              {t('error.storage', { error, label: persistence.label })}
              <div>
                <button onClick={downloadBackup}>{t('menu.backupDownload')}</button>
                {blocked && (
                  <>
                    {damaged.current !== null && (
                      <button
                        onClick={() =>
                          download(
                            'sloth-note-damaged.json',
                            damaged.current,
                            'application/json;charset=utf-8',
                          )
                        }
                      >
                        {t('error.downloadStored')}
                      </button>
                    )}
                    <button onClick={resetDamagedStorage}>{t('error.replaceStorage')}</button>
                  </>
                )}
              </div>
            </div>
          )}
          {persistence.vaultProblem && (
            <div className="save-error" role="alert">
              {t('error.vaultMissing', { path: persistence.vaultProblem.path })}
              <div>
                <button onClick={() => setFolderOpen(true)}>{t('menu.folder')}</button>
                <button onClick={useAppStorage}>{t('folder.useAppStorage')}</button>
              </div>
            </div>
          )}
          {folderError && (
            <div className="save-error" role="alert">
              {t('error.folder', { error: folderError })}
            </div>
          )}
          {importError && (
            <div className="save-error" role="alert">
              {t('error.import', { error: importError })}
            </div>
          )}
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
                {copyStatus && <span role="status">{copyStatus}</span>}
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
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
