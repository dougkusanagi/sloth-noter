import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Markdown } from './markdown.jsx'
import { createBackup, readBackup } from './backup.js'
import { findMatches } from './find.js'
import { headingFileName, isDiscardableEmptyNote, moveToTrash, nameFromHeading, purgeFromTrash, restoreFromTrash, uniqueName } from './notes.js'
import { openWorkspace } from './boot.js'
import { createAppPersistence } from './persistence-runtime.js'
import { createWriteQueue } from './write-queue.js'
import { VisualEditor } from './visual-editor.jsx'
import { wrapSelection } from './wrap-selection.js'
import { continueBlock } from './continue-block.js'
import { restoreWindowState } from './window-state.js'
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
  return <svg className="mode-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {mode === 'visual' ? <><path d="M1.5 10s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5Z" /><circle cx="10" cy="10" r="2.2" /></> : mode === 'source' ? <><path d="m7 5-4.5 5L7 15M13 5l4.5 5-4.5 5" /></> : <><path d="M10 5C7.8 3.7 5.3 3.5 2 4.5v10.7c3.3-1 5.8-.8 8 .5m0-10.7c2.2-1.3 4.7-1.5 8-.5v10.7c-3.3-1-5.8-.8-8 .5V5Z" /></>}
  </svg>
}

function Shortcut({ letter }) {
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
  return <span className="menu-shortcut" aria-label={`${modifier}+${letter}`}><kbd>{modifier}</kbd><span>+</span><kbd>{letter}</kbd></span>
}

function Opening({ failure }) {
  return <main className="app boot">
    <p role={failure ? 'alert' : 'status'}>{failure ? `Sloth Note could not open its notes: ${failure}` : 'Opening notes…'}</p>
  </main>
}

function App() {
  const [started, setStarted] = useState(null)
  const [failure, setFailure] = useState(null)
  useEffect(() => {
    let cancelled = false
    createAppPersistence()
      .then(async persistence => ({ persistence, loaded: await openWorkspace(persistence) }))
      .then(result => { if (!cancelled) setStarted(result) })
      .catch(cause => { if (!cancelled) setFailure(cause instanceof Error ? cause.message : 'storage is unavailable') })
    return () => { cancelled = true }
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
  const [conflict, setConflict] = useState(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [tabMenu, setTabMenu] = useState(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const damaged = useRef(loaded.raw)
  const writer = useRef(null)
  if (!writer.current) writer.current = createWriteQueue(document => persistence.save(document), setError)
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
  const active = data.notes.find(note => note.id === data.activeId) ?? null
  const choices = data.notes.filter(note => note.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const prefs = data.preferences

  useEffect(() => {
    let disposed = false
    let cleanup = () => {}
    restoreWindowState().then(stop => {
      if (disposed) stop()
      else cleanup = stop
    }).catch(() => {})
    return () => { disposed = true; cleanup() }
  }, [])

  function commit(next) {
    current.current = next
    setData(next)
    if (!blocked) writer.current.write(next)
  }
  function updatePrefs(change) { commit({ ...current.current, preferences: { ...current.current.preferences, ...change } }) }
  function focusEditor() { if (mode === 'source') editorRef.current?.focus(); else visualRef.current?.focus() }
  function openNote(id) {
    const old = current.current
    commit({ ...old, openIds: old.openIds.includes(id) ? old.openIds : [...old.openIds, id], activeId: id })
    if (mode === 'reading') setMode('visual')
    if (palette) closePalette()
    setTimeout(focusEditor, 0)
  }
  function createNote(name = 'new note.md', body = '') {
    const old = current.current
    const note = { id: crypto.randomUUID(), name: uniqueName(old.notes, headingFileName(body) ?? name), body, revision: 0 }
    commit({ ...old, notes: [...old.notes, note], openIds: [...old.openIds, note.id], activeId: note.id })
    if (mode === 'reading') setMode('visual')
    if (palette) closePalette()
    setTimeout(focusEditor, 0)
  }
  function updateBody(body) {
    const old = current.current
    const name = nameFromHeading(body, old.notes, old.activeId)
    commit({ ...old, notes: old.notes.map(note => note.id === old.activeId ? { ...note, name: name ?? note.name, body, revision: note.revision + 1 } : note) })
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
    const start = field.selectionStart, end = field.selectionEnd
    field.setRangeText(wrapped.insert, start, end, 'preserve')
    field.setSelectionRange(wrapped.from, wrapped.to)
    updateBody(field.value)
  }
  function closeTab(id) {
    const old = current.current
    const note = old.notes.find(item => item.id === id)
    const openIds = old.openIds.filter(item => item !== id)
    const notes = note && isDiscardableEmptyNote(note) ? old.notes.filter(item => item.id !== id) : old.notes
    commit({ ...old, notes, openIds, activeId: old.activeId === id ? (openIds.at(-1) ?? null) : old.activeId })
  }
  function openTabMenu(event, id) {
    event.preventDefault()
    event.stopPropagation()
    setTabMenu({ id, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 220)) })
  }
  function runTabMenu(action) {
    const menu = tabMenu
    if (!menu || !current.current.notes.some(note => note.id === menu.id)) return
    setTabMenu(null)
    if (action === 'open') openNote(menu.id)
    if (action === 'rename') renameNote(menu.id)
    if (action === 'close') closeTab(menu.id)
    if (action === 'trash') deleteNote(menu.id)
  }
  function renameNote(id = active?.id) {
    const note = data.notes.find(item => item.id === id)
    if (!note) return
    const proposed = window.prompt('Note name', note.name)?.trim()
    if (!proposed || proposed === note.name) return
    const name = proposed.toLowerCase().endsWith('.md') ? proposed : `${proposed}.md`
    if (data.notes.some(item => item.id !== id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { window.alert('A note with that name already exists.'); return }
    const body = note.body.replace(/^# [ \t]*(.+?)[ \t]*$/m, `# ${name.slice(0, -3)}`)
    commit({ ...current.current, notes: current.current.notes.map(item => item.id === id ? { ...item, name, body, revision: item.revision + 1 } : item) })
  }
  function deleteNote(id = active?.id) {
    const note = data.notes.find(item => item.id === id)
    if (!note || !window.confirm(`Move ${note.name} to Trash?`)) return
    commit(moveToTrash(current.current, id, Date.now()))
  }
  function restoreNote(id) {
    commit(restoreFromTrash(current.current, id))
    if (mode === 'reading') setMode('visual')
    closeTrash()
  }
  function purgeNote(id) {
    const note = data.trash.find(entry => entry.note.id === id)?.note
    if (note && window.confirm(`Permanently delete ${note.name}? This cannot be undone.`)) commit(purgeFromTrash(current.current, id))
  }
  function closeTrash() { setTrashOpen(false); setTimeout(() => menuButton.current?.focus(), 0) }
  async function importFile(file) {
    if (!file) return
    setImportError('')
    try {
      const body = await file.text()
      const name = headingFileName(body) ?? (file.name.toLowerCase().endsWith('.md') ? file.name : `${file.name}.md`)
      const existing = current.current.notes.find(note => note.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      if (existing) setConflict({ name, body, id: existing.id })
      else createNote(name, body)
    } catch (cause) { setImportError(cause instanceof Error ? cause.message : 'Could not read file') }
  }
  function downloadBackup() {
    download('sloth-note-backup.json', createBackup(current.current), 'application/json;charset=utf-8')
  }
  async function restoreBackup(file) {
    if (!file) return
    setImportError('')
    try {
      const restored = readBackup(await file.text())
      if (!window.confirm(`Replace current notes with this backup (${restored.notes.length} notes, ${restored.trash.length} in Trash)?`)) return
      commit(restored)
      if (mode === 'reading') setMode('visual')
      setFindOpen(false)
      setTrashOpen(false)
    } catch (cause) { setImportError(cause instanceof Error ? cause.message : 'Could not read backup') }
  }
  function resolveConflict(replace) {
    if (!conflict) return
    if (replace) {
      const old = current.current
      commit({ ...old, notes: old.notes.map(note => note.id === conflict.id ? { ...note, body: conflict.body, revision: note.revision + 1 } : note), openIds: old.openIds.includes(conflict.id) ? old.openIds : [...old.openIds, conflict.id], activeId: conflict.id })
      if (mode === 'reading') setMode('visual')
    } else createNote(conflict.name, conflict.body)
    closeConflict()
  }
  function closeConflict() { setConflict(null); setTimeout(() => menuButton.current?.focus(), 0) }
  async function copyCode(source) {
    try { await navigator.clipboard.writeText(source); setCopyStatus('Copied') }
    catch { setCopyStatus('Could not copy') }
  }
  function openPalette() { returnFocus.current = menuOpen ? menuButton.current : document.activeElement; setQuery(''); setSelected(0); setPalette(true) }
  function closePalette() { setPalette(false); setTimeout(() => (returnFocus.current?.isConnected ? returnFocus.current : menuButton.current)?.focus(), 0) }
  function closeMenu(restoreFocus = true) { setMenuOpen(false); if (restoreFocus) setTimeout(() => menuButton.current?.focus(), 0) }
  function openFind() { setMenuOpen(false); if (mode === 'reading') setMode('visual'); setFindOpen(true); setFindIndex(0); setTimeout(() => findInput.current?.focus(), 0) }
  function closeFind() { setFindOpen(false); setTimeout(focusEditor, 0) }
  function currentMatches() { return active ? findMatches(active.body, findQuery) : [] }
  function selectFind(index = findIndex) {
    const matches = currentMatches()
    if (!matches.length) return
    const safeIndex = (index + matches.length) % matches.length
    if (mode === 'source' && editorRef.current) {
      editorRef.current.focus()
      editorRef.current.setSelectionRange(matches[safeIndex].start, matches[safeIndex].end)
    } else if (visualRef.current) {
      visualRef.current.dispatch({ selection: { anchor: matches[safeIndex].start, head: matches[safeIndex].end }, scrollIntoView: true })
    }
    findInput.current?.focus()
    setFindIndex(safeIndex)
  }
  function runMenu(action, restoreFocus = true) { setMenuOpen(false); action(); if (restoreFocus) setTimeout(() => menuButton.current?.focus(), 0) }
  function changeMode(next) { setMode(next); setMenuOpen(false) }
  async function resetDamagedStorage() {
    const failure = await persistence.save(current.current)
    setError(failure)
    if (!failure) setBlocked(false)
  }

  useEffect(() => {
    const theme = prefs.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : prefs.theme
    document.documentElement.dataset.theme = theme
    if (prefs.theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const change = () => { document.documentElement.dataset.theme = media.matches ? 'dark' : 'light' }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [prefs.theme])
  useEffect(() => { if (palette) search.current?.focus() }, [palette])
  useEffect(() => { if (palette) document.querySelector('.results .selected')?.scrollIntoView({ block: 'nearest' }) }, [palette, query, selected])
  useEffect(() => { if (conflict) conflictFirst.current?.focus() }, [conflict])
  useEffect(() => { if (trashOpen) trashFirst.current?.focus() }, [trashOpen])
  useEffect(() => { if (trashOpen && document.activeElement === document.body) trashFirst.current?.focus() }, [trashOpen, data.trash.length])
  useEffect(() => {
    const list = tabListRef.current, tab = activeTabRef.current
    if (!list || !tab) return
    const showActiveTab = () => {
      const listBox = list.getBoundingClientRect(), tabBox = tab.getBoundingClientRect()
      if (tabBox.left < listBox.left) list.scrollLeft += tabBox.left - listBox.left
      else if (tabBox.right > listBox.right) list.scrollLeft += tabBox.right - listBox.right
    }
    showActiveTab()
    const observer = new ResizeObserver(showActiveTab)
    observer.observe(list)
    window.addEventListener('resize', showActiveTab)
    return () => { observer.disconnect(); window.removeEventListener('resize', showActiveTab) }
  }, [data.activeId, data.openIds, prefs.tabsVisible])
  useEffect(() => { if (menuOpen) menuFirst.current?.focus() }, [menuOpen])
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = event => { if (!menuWrap.current?.contains(event.target)) closeMenu(false) }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [menuOpen])
  useEffect(() => {
    if (!tabMenu) return
    const onPointer = event => { if (!event.target.closest('.tab-context-menu')) setTabMenu(null) }
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); setTabMenu(null) } }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    const frame = requestAnimationFrame(() => tabMenuFirst.current?.focus())
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', onPointer, true); document.removeEventListener('keydown', onKey, true) }
  }, [tabMenu])
  useEffect(() => {
    const onKey = event => {
      if (conflict) { if (event.key === 'Escape') closeConflict(); return }
      if (trashOpen) { if (event.key === 'Escape') closeTrash(); return }
      if (menuOpen && event.key === 'Escape') { closeMenu(); return }
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (modifier && key === 'p') { event.preventDefault(); setMenuOpen(false); openPalette() }
      if (modifier && key === 'f') { event.preventDefault(); openFind() }
      if (modifier && key === 't') { event.preventDefault(); setMenuOpen(false); createNote() }
      if (modifier && key === 'w') { event.preventDefault(); setMenuOpen(false); if (active) closeTab(active.id) }
      if (modifier && key === 'i') { event.preventDefault(); setMenuOpen(false); importInput.current?.click() }
      if (modifier && key === 'e') { event.preventDefault(); if (active) download(active.name, active.body) }
      if (modifier && (event.key === '+' || event.code === 'Equal')) { event.preventDefault(); updatePrefs({ fontSize: Math.min(24, prefs.fontSize + 1) }) }
      if (modifier && (event.key === '-' || event.code === 'Minus')) { event.preventDefault(); updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) }) }
      if (modifier && key === '0') { event.preventDefault(); updatePrefs({ fontSize: 18 }) }
      if (event.key === 'Escape' && palette) closePalette()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return <main className="app" style={{ '--editor-size': `${prefs.fontSize}px` }}>
    <header className="app-header">
      <div className="main-menu-wrap" ref={menuWrap}>
        <button ref={menuButton} className="menu-trigger" aria-label="Main menu" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="main-menu" onClick={() => setMenuOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setMenuOpen(true) } }}>☰</button>
        {menuOpen && <div id="main-menu" className="main-menu" role="menu" aria-label="Main menu" onKeyDown={event => {
          const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')]
          const index = items.indexOf(document.activeElement)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus() }
          if (event.key === 'Home') { event.preventDefault(); items[0]?.focus() }
          if (event.key === 'End') { event.preventDefault(); items.at(-1)?.focus() }
          if (event.key === 'Tab') { event.preventDefault(); closeMenu() }
          if (event.key === 'Escape') { event.stopPropagation(); closeMenu() }
        }}>
          <div className="menu-heading" role="presentation">Notes</div>
          <button ref={menuFirst} role="menuitem" onClick={() => runMenu(() => createNote(), false)}><span>New note</span><Shortcut letter="T" /></button>
          <button role="menuitem" onClick={() => runMenu(openPalette, false)}><span>Find note</span><Shortcut letter="P" /></button>
          <button role="menuitem" disabled={!active} onClick={() => runMenu(openFind, false)}><span>Find in note</span><Shortcut letter="F" /></button>
           <button role="menuitem" onClick={() => runMenu(() => importInput.current?.click(), false)}><span>Import .md</span><Shortcut letter="I" /></button>
           <button role="menuitem" disabled={!active} onClick={() => runMenu(() => download(active.name, active.body))}><span>Export .md</span><Shortcut letter="E" /></button>
          <button role="menuitem" onClick={() => runMenu(downloadBackup)}>Download backup</button>
          <button role="menuitem" onClick={() => runMenu(() => backupInput.current?.click(), false)}>Restore backup</button>
          <button role="menuitem" disabled={!active} onClick={() => runMenu(renameNote)}>Rename note</button>
           <button role="menuitem" disabled={!active} onClick={() => runMenu(() => closeTab(active.id))}><span>Close tab</span><Shortcut letter="W" /></button>
          <button role="menuitem" disabled={!active} onClick={() => runMenu(deleteNote)}>Move to Trash</button>
          {data.trash.length > 0 && <button role="menuitem" onClick={() => runMenu(() => restoreNote(data.trash.at(-1).note.id))}>Undo delete</button>}
          <button role="menuitem" onClick={() => runMenu(() => setTrashOpen(true), false)}>Trash ({data.trash.length})</button>
          <div className="menu-heading" role="presentation">View</div>
          <button role="menuitem" onClick={() => runMenu(() => updatePrefs({ tabsVisible: !prefs.tabsVisible }))}>{prefs.tabsVisible ? 'Hide tabs' : 'Show tabs'}</button>
          <button role="menuitem" onClick={() => runMenu(() => updatePrefs({ theme: prefs.theme === 'system' ? 'light' : prefs.theme === 'light' ? 'dark' : 'system' }))}>Theme: {prefs.theme}</button>
           <button role="menuitem" onClick={() => runMenu(() => updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) }))}><span>Smaller text</span><Shortcut letter="-" /></button>
           <button role="menuitem" onClick={() => runMenu(() => updatePrefs({ fontSize: Math.min(24, prefs.fontSize + 1) }))}><span>Larger text</span><Shortcut letter="+" /></button>
        </div>}
      </div>
      <span className="app-title">Sloth Note</span>
      {prefs.tabsVisible && data.openIds.length > 0 && <nav className="tabs" aria-label="Open notes"><div className="tab-list" ref={tabListRef}>{data.openIds.map(id => {
        const note = data.notes.find(item => item.id === id)
        return note && <button key={id} ref={id === data.activeId ? activeTabRef : null} className={id === data.activeId ? 'tab active' : 'tab'} aria-haspopup="menu" aria-expanded={tabMenu?.id === id} onClick={() => openNote(id)} onAuxClick={event => { if (event.button === 1) { event.preventDefault(); closeTab(id) } }} onContextMenu={event => openTabMenu(event, id)} onMouseDown={event => { if (event.button === 1) event.preventDefault() }}>{note.name}</button>
      })}</div></nav>}
      <span className="sr-only" role="status">{error ? 'Not saved' : 'Saved'}</span>
      <input ref={importInput} type="file" accept=".md,.markdown,text/markdown,text/plain" hidden onChange={event => { importFile(event.target.files?.[0]); event.target.value = '' }} />
      <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={event => { restoreBackup(event.target.files?.[0]); event.target.value = '' }} />
    </header>
    {tabMenu && <div className="tab-context-menu" role="menu" aria-label="Ações da aba" style={{ left: tabMenu.x, top: tabMenu.y }} onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
      const index = buttons.indexOf(document.activeElement)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus() }
      if (event.key === 'Home') { event.preventDefault(); buttons[0]?.focus() }
      if (event.key === 'End') { event.preventDefault(); buttons.at(-1)?.focus() }
      if (event.key === 'Escape') { event.preventDefault(); setTabMenu(null) }
    }}>
      <button ref={tabMenuFirst} type="button" role="menuitem" onClick={() => runTabMenu('open')}><span>Abrir nota</span></button>
      <button type="button" role="menuitem" onClick={() => runTabMenu('rename')}><span>Renomear nota</span></button>
      <button type="button" role="menuitem" onClick={() => runTabMenu('close')}><span>Fechar aba</span><Shortcut letter="W" /></button>
      <div className="table-context-menu-separator" />
      <button type="button" role="menuitem" onClick={() => runTabMenu('trash')}><span>Mover para Lixeira</span></button>
    </div>}
    <section className="editor-shell">
      <fieldset className="mode-switch">
        <legend className="sr-only">Modo de visualização</legend>
        {[['visual', 'Padrão'], ['source', 'Código'], ['reading', 'Leitura']].map(([value, label]) => <label key={value} title={label}><input type="radio" name="editor-mode" value={value} aria-label={label} checked={mode === value} onChange={() => changeMode(value)} /><ModeIcon mode={value} /><span className="mode-label">{label}</span></label>)}
      </fieldset>
      {error && <div className="save-error" role="alert">Storage failed: {error}. Text stays in memory; download a backup before closing. Writes go to {persistence.label}.<div><button onClick={downloadBackup}>Download backup</button>{blocked && <>{damaged.current !== null && <button onClick={() => download('sloth-note-damaged.json', damaged.current, 'application/json;charset=utf-8')}>Download stored data</button>}<button onClick={resetDamagedStorage}>Replace storage with current notes</button></>}</div></div>}
      {importError && <div className="save-error" role="alert">Import failed: {importError}</div>}
      {active ? (mode === 'reading' ? <div className="reading"><Markdown text={active.body} onCopy={copyCode} />{copyStatus && <span role="status">{copyStatus}</span>}</div> : mode === 'source' ? <textarea ref={editorRef} key={active.id} aria-label="Editor Markdown em texto puro" spellCheck="false" value={active.body} onChange={event => updateBody(event.target.value)} onKeyDown={wrapSourceSelection} /> : <VisualEditor key={active.id} noteId={active.id} body={active.body} onChange={updateBody} onReady={view => { visualRef.current = view }} />) : <div className="empty-note">No open note. Use ☰ to find or create one.</div>}
    </section>
    {palette && <div className="palette-backdrop" onMouseDown={closePalette}><section className="palette" role="dialog" aria-modal="true" aria-label="Find note" onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Tab') { const focusable = [search.current, ...event.currentTarget.querySelectorAll('button')]; const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } } }}><input ref={search} aria-label="Search notes" value={query} onChange={event => { setQuery(event.target.value); setSelected(0) }} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(index => Math.min(choices.length - 1, index + 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => Math.max(0, index - 1)) } if (event.key === 'Enter' && choices[selected]) openNote(choices[selected].id) }} placeholder="Find a note…" /><div className="results">{choices.length ? choices.map((note, index) => <button key={note.id} className={index === selected ? 'selected' : ''} aria-current={index === selected ? 'true' : undefined} onClick={() => openNote(note.id)}>{note.name}</button>) : <p>No notes found</p>}</div><button className="dialog-close" onClick={closePalette}>Close</button></section></div>}
    {conflict && <div className="palette-backdrop"><section className="palette conflict" role="dialog" aria-modal="true" aria-label="Import conflict" onKeyDown={event => { if (event.key === 'Escape') closeConflict(); if (event.key === 'Tab') { const buttons = [...event.currentTarget.querySelectorAll('button')]; if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus() } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus() } } }}><p>A note named <strong>{conflict.name}</strong> already exists.</p><button ref={conflictFirst} onClick={() => resolveConflict(false)}>Keep both</button><button onClick={() => resolveConflict(true)}>Replace existing note</button><button onClick={closeConflict}>Cancel</button></section></div>}
    {trashOpen && <div className="palette-backdrop"><section className="palette trash-dialog" role="dialog" aria-modal="true" aria-label="Trash" onKeyDown={event => { if (event.key === 'Tab') { const buttons = [...event.currentTarget.querySelectorAll('button')]; if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus() } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus() } } }}><h2>Trash</h2>{data.trash.length ? <div className="trash-list">{data.trash.map(entry => <div className="trash-item" key={entry.note.id}><span>{entry.note.name}</span><button onClick={() => restoreNote(entry.note.id)}>Restore</button><button onClick={() => purgeNote(entry.note.id)}>Delete forever</button></div>)}</div> : <p>Trash is empty.</p>}<button ref={trashFirst} onClick={closeTrash}>Close</button></section></div>}
    {findOpen && <div className="palette-backdrop" onMouseDown={closeFind}><section className="palette find-dialog" role="dialog" aria-modal="true" aria-label="Find in note" onMouseDown={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); closeFind() }
      if (event.key === 'Enter') { event.preventDefault(); selectFind(findIndex + (event.shiftKey ? -1 : 1)) }
      if (event.key === 'Tab') {
        const focusable = [findInput.current, ...event.currentTarget.querySelectorAll('button:not(:disabled)')]
        const first = focusable[0], last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }}><input ref={findInput} aria-label="Text to find" value={findQuery} onChange={event => { setFindQuery(event.target.value); setFindIndex(0) }} placeholder="Find in this note…" /><p role="status">{findQuery ? `${currentMatches().length} match${currentMatches().length === 1 ? '' : 'es'}` : 'Type text to search'}</p><button disabled={!currentMatches().length} onClick={() => selectFind(findIndex - 1)}>Previous</button><button disabled={!currentMatches().length} onClick={() => selectFind(findIndex + 1)}>Next</button><button className="dialog-close" onClick={closeFind}>Close</button></section></div>}
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
