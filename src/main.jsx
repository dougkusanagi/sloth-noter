import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Markdown } from './markdown.jsx'
import { createBackup, readBackup } from './backup.js'
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
  PaletteDialog,
  PromptDialog,
  SyncConflictDialog,
  TrashDialog,
} from './components/dialogs.jsx'
import { LANGUAGES, setLanguage, t } from './i18n.js'
import { wrapSelection } from './wrap-selection.js'
import { continueBlock } from './continue-block.js'
import { restoreWindowState } from './window-state.js'
import { BookOpen, Code, Eye } from 'lucide-react'
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
    writer.current = createWriteQueue((document) => persistence.save(document), setError)
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
  setLanguage(prefs.language)

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
    })
    if (mode === 'reading') setMode('visual')
    if (palette) closePalette()
    setTimeout(focusEditor, 0)
  }
  function createNote(name = 'new note.md', body = '') {
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
    setTimeout(focusEditor, 0)
  }
  function updateBody(body) {
    const old = current.current
    const name = nameFromHeading(body, old.notes, old.activeId)
    commit({
      ...old,
      notes: old.notes.map((note) =>
        note.id === old.activeId
          ? { ...note, name: name ?? note.name, body, revision: note.revision + 1 }
          : note,
      ),
    })
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
      notes: current.current.notes.map((item) =>
        item.id === id ? { ...item, name, body, revision: item.revision + 1 } : item,
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
    setFolderError('')
    try {
      await writer.current.whenIdle()
      if (await change()) window.location.reload()
    } catch (cause) {
      setFolderError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  function chooseFolder() {
    return switchFolder(() =>
      connectVault(persistence.invoke, (count) =>
        ask({
          kind: 'confirm',
          message: t('dialog.folderCopy', { count }),
          confirmLabel: t('dialog.folderCopyConfirm'),
          cancelLabel: t('dialog.folderCopyDecline'),
        }),
      ),
    )
  }
  function useAppStorage() {
    return switchFolder(async () => {
      await persistence.invoke(VAULT_DISCONNECT)
      return true
    })
  }
  function resolveSync(choice) {
    const [conflict, ...rest] = syncConflicts
    setSyncConflicts(rest)
    commit(persistence.sync.resolve(current.current, conflict, choice))
  }
  function downloadBackup() {
    download(
      'sloth-note-backup.json',
      createBackup(current.current),
      'application/json;charset=utf-8',
    )
  }
  async function restoreBackup(file) {
    if (!file) return
    setImportError('')
    try {
      const restored = readBackup(await file.text())
      const confirmed = await ask({
        kind: 'confirm',
        message: t('dialog.backupReplace', {
          notes: restored.notes.length,
          trash: restored.trash.length,
        }),
        confirmLabel: t('dialog.backupReplaceConfirm'),
      })
      if (!confirmed) return
      commit(restored)
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
      if (running || stopped || document.visibilityState === 'hidden') return
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
  }, [persistence])
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
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (modifier && key === 'p') {
        event.preventDefault()
        setMenuOpen(false)
        openPalette()
      }
      if (modifier && key === 'f') {
        event.preventDefault()
        openFind()
      }
      if (modifier && key === 't') {
        event.preventDefault()
        setMenuOpen(false)
        createNote()
      }
      if (modifier && key === 'w') {
        event.preventDefault()
        setMenuOpen(false)
        if (active) closeTab(active.id)
      }
      if (modifier && key === 'i') {
        event.preventDefault()
        setMenuOpen(false)
        importInput.current?.click()
      }
      if (modifier && key === 'e') {
        event.preventDefault()
        if (active) download(active.name, active.body)
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

  return (
    <main className="app" style={{ '--editor-size': `${prefs.fontSize}px` }}>
      <header className="app-header">
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
            ☰
          </button>
          {menuOpen && (
            <div
              id="main-menu"
              className="main-menu"
              role="menu"
              aria-label={t('menu.main')}
              onKeyDown={(event) => {
                const items = [
                  ...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)'),
                ]
                const index = items.indexOf(document.activeElement)
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  items[
                    (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
                  ]?.focus()
                }
                if (event.key === 'Home') {
                  event.preventDefault()
                  items[0]?.focus()
                }
                if (event.key === 'End') {
                  event.preventDefault()
                  items.at(-1)?.focus()
                }
                if (event.key === 'Tab') {
                  event.preventDefault()
                  closeMenu()
                }
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  closeMenu()
                }
              }}
            >
              <div className="menu-heading" role="presentation">
                {t('menu.notes')}
              </div>
              <button
                ref={menuFirst}
                role="menuitem"
                onClick={() => runMenu(() => createNote(), false)}
              >
                <span>{t('menu.newNote')}</span>
                <Shortcut letter="T" />
              </button>
              <button role="menuitem" onClick={() => runMenu(openPalette, false)}>
                <span>{t('menu.findNote')}</span>
                <Shortcut letter="P" />
              </button>
              <button role="menuitem" disabled={!active} onClick={() => runMenu(openFind, false)}>
                <span>{t('menu.findInNote')}</span>
                <Shortcut letter="F" />
              </button>
              <button
                role="menuitem"
                onClick={() => runMenu(() => importInput.current?.click(), false)}
              >
                <span>{t('menu.import')}</span>
                <Shortcut letter="I" />
              </button>
              <button
                role="menuitem"
                disabled={!active}
                onClick={() => runMenu(() => download(active.name, active.body))}
              >
                <span>{t('menu.export')}</span>
                <Shortcut letter="E" />
              </button>
              <button role="menuitem" onClick={() => runMenu(downloadBackup)}>
                {t('menu.backupDownload')}
              </button>
              <button
                role="menuitem"
                onClick={() => runMenu(() => backupInput.current?.click(), false)}
              >
                {t('menu.backupRestore')}
              </button>
              {persistence.invoke && (
                <button role="menuitem" onClick={() => runMenu(() => setFolderOpen(true), false)}>
                  {t('menu.folder')}
                </button>
              )}
              <button role="menuitem" disabled={!active} onClick={() => runMenu(renameNote)}>
                {t('menu.rename')}
              </button>
              <button
                role="menuitem"
                disabled={!active}
                onClick={() => runMenu(() => closeTab(active.id))}
              >
                <span>Close tab</span>
                <Shortcut letter="W" />
              </button>
              <button role="menuitem" disabled={!active} onClick={() => runMenu(deleteNote)}>
                {t('menu.trashMove')}
              </button>
              {data.trash.length > 0 && (
                <button
                  role="menuitem"
                  onClick={() => runMenu(() => restoreNote(data.trash.at(-1).note.id))}
                >
                  {t('menu.undoDelete')}
                </button>
              )}
              <button role="menuitem" onClick={() => runMenu(() => setTrashOpen(true), false)}>
                {t('menu.trash', { count: data.trash.length })}
              </button>
              <div className="menu-heading" role="presentation">
                {t('menu.view')}
              </div>
              <button
                role="menuitem"
                onClick={() => runMenu(() => updatePrefs({ tabsVisible: !prefs.tabsVisible }))}
              >
                {prefs.tabsVisible ? t('menu.tabsHide') : t('menu.tabsShow')}
              </button>
              <button
                role="menuitem"
                onClick={() =>
                  runMenu(() =>
                    updatePrefs({
                      theme:
                        prefs.theme === 'system'
                          ? 'light'
                          : prefs.theme === 'light'
                            ? 'dark'
                            : 'system',
                    }),
                  )
                }
              >
                {t('menu.theme', { theme: t(`theme.${prefs.theme}`) })}
              </button>
              <button
                role="menuitem"
                onClick={() =>
                  runMenu(() => updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) }))
                }
              >
                <span>{t('menu.smaller')}</span>
                <Shortcut letter="-" />
              </button>
              <button
                role="menuitem"
                onClick={() =>
                  runMenu(() => updatePrefs({ fontSize: Math.min(24, prefs.fontSize + 1) }))
                }
              >
                <span>{t('menu.larger')}</span>
                <Shortcut letter="+" />
              </button>
              <button
                role="menuitem"
                onClick={() =>
                  runMenu(() => updatePrefs({ language: prefs.language === 'en' ? 'pt-BR' : 'en' }))
                }
              >
                {t('menu.language', { language: LANGUAGES[prefs.language] ?? LANGUAGES['pt-BR'] })}
              </button>
            </div>
          )}
        </div>
        <span className="app-title">Sloth Note</span>
        {prefs.tabsVisible && data.openIds.length > 0 && (
          <nav className="tabs" aria-label={t('tabs.label')}>
            <div className="tab-list" ref={tabListRef}>
              {data.openIds.map((id) => {
                const note = data.notes.find((item) => item.id === id)
                return (
                  note && (
                    <button
                      key={id}
                      ref={id === data.activeId ? activeTabRef : null}
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
                      {note.name}
                    </button>
                  )
                )
              })}
            </div>
          </nav>
        )}
        <span className="sr-only" role="status">
          {error ? t('save.notSaved') : t('save.saved')}
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
      <section className="editor-shell">
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
              <Markdown text={active.body} onCopy={copyCode} />
              {copyStatus && <span role="status">{copyStatus}</span>}
            </div>
          ) : mode === 'source' ? (
            <textarea
              ref={editorRef}
              key={active.id}
              aria-label={t('mode.sourceEditor')}
              spellCheck="false"
              value={active.body}
              onChange={(event) => updateBody(event.target.value)}
              onKeyDown={wrapSourceSelection}
            />
          ) : (
            <VisualEditor
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
