import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Markdown } from './markdown.jsx'
import { createBackup, readBackup } from './backup.js'
import { findMatches } from './find.js'
import { moveToTrash, purgeFromTrash, restoreFromTrash, uniqueName } from './notes.js'
import { loadDocument, saveDocument } from './storage.js'
import './styles.css'

function getStorage() {
  try { return window.localStorage } catch { return null }
}

function download(name, body, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function App() {
  const storage = useRef(getStorage())
  const initial = useRef(null)
  if (!initial.current) initial.current = loadDocument(storage.current)
  const current = useRef(initial.current.document)
  const [data, setData] = useState(initial.current.document)
  const [error, setError] = useState(initial.current.error)
  const [blocked, setBlocked] = useState(initial.current.blocked)
  const [reading, setReading] = useState(false)
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const [importError, setImportError] = useState('')
  const [conflict, setConflict] = useState(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const search = useRef(null)
  const conflictFirst = useRef(null)
  const importInput = useRef(null)
  const backupInput = useRef(null)
  const menuButton = useRef(null)
  const menuWrap = useRef(null)
  const menuFirst = useRef(null)
  const findInput = useRef(null)
  const editorRef = useRef(null)
  const tabListRef = useRef(null)
  const activeTabRef = useRef(null)
  const trashFirst = useRef(null)
  const returnFocus = useRef(null)
  const active = data.notes.find(note => note.id === data.activeId) ?? null
  const choices = data.notes.filter(note => note.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const prefs = data.preferences

  function commit(next) {
    current.current = next
    setData(next)
    if (!blocked) setError(saveDocument(storage.current, next))
  }
  function updatePrefs(change) { commit({ ...current.current, preferences: { ...current.current.preferences, ...change } }) }
  function openNote(id) {
    const old = current.current
    commit({ ...old, openIds: old.openIds.includes(id) ? old.openIds : [...old.openIds, id], activeId: id })
    setReading(false)
    if (palette) closePalette()
    setTimeout(() => editorRef.current?.focus(), 0)
  }
  function createNote(name = 'new note.md', body = '') {
    const old = current.current
    const note = { id: crypto.randomUUID(), name: uniqueName(old.notes, name), body, revision: 0 }
    commit({ ...old, notes: [...old.notes, note], openIds: [...old.openIds, note.id], activeId: note.id })
    setReading(false)
    if (palette) closePalette()
    setTimeout(() => editorRef.current?.focus(), 0)
  }
  function updateBody(body) {
    const old = current.current
    commit({ ...old, notes: old.notes.map(note => note.id === old.activeId ? { ...note, body, revision: note.revision + 1 } : note) })
  }
  function closeTab(id) {
    const old = current.current
    const openIds = old.openIds.filter(item => item !== id)
    commit({ ...old, openIds, activeId: old.activeId === id ? (openIds.at(-1) ?? null) : old.activeId })
  }
  function renameNote() {
    if (!active) return
    const proposed = window.prompt('Note name', active.name)?.trim()
    if (!proposed || proposed === active.name) return
    const name = proposed.toLowerCase().endsWith('.md') ? proposed : `${proposed}.md`
    if (data.notes.some(note => note.id !== active.id && note.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { window.alert('A note with that name already exists.'); return }
    commit({ ...current.current, notes: current.current.notes.map(note => note.id === active.id ? { ...note, name, revision: note.revision + 1 } : note) })
  }
  function deleteNote() {
    if (!active || !window.confirm(`Move ${active.name} to Trash?`)) return
    commit(moveToTrash(current.current, active.id, Date.now()))
  }
  function restoreNote(id) {
    commit(restoreFromTrash(current.current, id))
    setReading(false)
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
      const name = file.name.toLowerCase().endsWith('.md') ? file.name : `${file.name}.md`
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
      setReading(false)
      setFindOpen(false)
      setTrashOpen(false)
    } catch (cause) { setImportError(cause instanceof Error ? cause.message : 'Could not read backup') }
  }
  function resolveConflict(replace) {
    if (!conflict) return
    if (replace) {
      const old = current.current
      commit({ ...old, notes: old.notes.map(note => note.id === conflict.id ? { ...note, body: conflict.body, revision: note.revision + 1 } : note), openIds: old.openIds.includes(conflict.id) ? old.openIds : [...old.openIds, conflict.id], activeId: conflict.id })
      setReading(false)
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
  function openFind() { setMenuOpen(false); setReading(false); setFindOpen(true); setFindIndex(0); setTimeout(() => findInput.current?.focus(), 0) }
  function closeFind() { setFindOpen(false); setTimeout(() => editorRef.current?.focus(), 0) }
  function currentMatches() { return active ? findMatches(active.body, findQuery) : [] }
  function selectFind(index = findIndex) {
    const matches = currentMatches()
    if (!matches.length || !editorRef.current) return
    const safeIndex = (index + matches.length) % matches.length
    editorRef.current.focus()
    editorRef.current.setSelectionRange(matches[safeIndex].start, matches[safeIndex].end)
    findInput.current?.focus()
    setFindIndex(safeIndex)
  }
  function runMenu(action, restoreFocus = true) { setMenuOpen(false); action(); if (restoreFocus) setTimeout(() => menuButton.current?.focus(), 0) }
  function toggleReading() { setReading(!reading); if (reading) setTimeout(() => editorRef.current?.focus(), 0) }
  function resetDamagedStorage() {
    const failure = saveDocument(storage.current, current.current)
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
    const onKey = event => {
      if (conflict) { if (event.key === 'Escape') closeConflict(); return }
      if (trashOpen) { if (event.key === 'Escape') closeTrash(); return }
      if (menuOpen && event.key === 'Escape') { closeMenu(); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); setMenuOpen(false); openPalette() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); openFind() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') { event.preventDefault(); setMenuOpen(false); createNote() }
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
          <button ref={menuFirst} role="menuitem" onClick={() => runMenu(() => createNote(), false)}>New note</button>
          <button role="menuitem" onClick={() => runMenu(openPalette, false)}>Find note</button>
          <button role="menuitem" disabled={!active} onClick={() => runMenu(openFind, false)}>Find in note</button>
          <button role="menuitem" onClick={() => runMenu(() => importInput.current?.click(), false)}>Import .md</button>
          <button role="menuitem" disabled={!active} onClick={() => runMenu(() => download(active.name, active.body))}>Export .md</button>
          <button role="menuitem" onClick={() => runMenu(downloadBackup)}>Download backup</button>
          <button role="menuitem" onClick={() => runMenu(() => backupInput.current?.click(), false)}>Restore backup</button>
          <button role="menuitem" disabled={!active} onClick={() => runMenu(renameNote)}>Rename note</button>
          <button role="menuitem" disabled={!active} onClick={() => runMenu(() => closeTab(active.id))}>Close tab</button>
          <button role="menuitem" disabled={!active} onClick={() => runMenu(deleteNote)}>Move to Trash</button>
          {data.trash.length > 0 && <button role="menuitem" onClick={() => runMenu(() => restoreNote(data.trash.at(-1).note.id))}>Undo delete</button>}
          <button role="menuitem" onClick={() => runMenu(() => setTrashOpen(true), false)}>Trash ({data.trash.length})</button>
          <div className="menu-heading" role="presentation">View</div>
          <button role="menuitem" disabled={!active} onClick={() => runMenu(toggleReading, !reading)}>{reading ? 'Edit note' : 'Read note'}</button>
          <button role="menuitem" onClick={() => runMenu(() => updatePrefs({ tabsVisible: !prefs.tabsVisible }))}>{prefs.tabsVisible ? 'Hide tabs' : 'Show tabs'}</button>
          <button role="menuitem" onClick={() => runMenu(() => updatePrefs({ theme: prefs.theme === 'system' ? 'light' : prefs.theme === 'light' ? 'dark' : 'system' }))}>Theme: {prefs.theme}</button>
          <button role="menuitem" onClick={() => runMenu(() => updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) }))}>Smaller text</button>
          <button role="menuitem" onClick={() => runMenu(() => updatePrefs({ fontSize: Math.min(24, prefs.fontSize + 1) }))}>Larger text</button>
        </div>}
      </div>
      <span className="app-title">Sloth Note</span>
      {prefs.tabsVisible && data.openIds.length > 0 && <nav className="tabs" aria-label="Open notes"><div className="tab-list" ref={tabListRef}>{data.openIds.map(id => {
        const note = data.notes.find(item => item.id === id)
        return note && <button key={id} ref={id === data.activeId ? activeTabRef : null} className={id === data.activeId ? 'tab active' : 'tab'} onClick={() => openNote(id)}>{note.name}</button>
      })}</div></nav>}
      <span className="sr-only" role="status">{error ? 'Not saved' : 'Saved in this browser'}</span>
      <input ref={importInput} type="file" accept=".md,.markdown,text/markdown,text/plain" hidden onChange={event => { importFile(event.target.files?.[0]); event.target.value = '' }} />
      <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={event => { restoreBackup(event.target.files?.[0]); event.target.value = '' }} />
    </header>
    <section className="editor-shell">
      {error && <div className="save-error" role="alert">Storage failed: {error}. Text stays in memory; download a backup before closing.<div><button onClick={downloadBackup}>Download backup</button>{blocked && <>{initial.current.raw !== null && <button onClick={() => download('sloth-note-damaged.json', initial.current.raw, 'application/json;charset=utf-8')}>Download stored data</button>}<button onClick={resetDamagedStorage}>Replace storage with current notes</button></>}</div></div>}
      {importError && <div className="save-error" role="alert">Import failed: {importError}</div>}
      {active ? (reading ? <div className="reading"><Markdown text={active.body} onCopy={copyCode} />{copyStatus && <span role="status">{copyStatus}</span>}</div> : <textarea ref={editorRef} key={active.id} aria-label="Markdown editor" spellCheck="false" value={active.body} onChange={event => updateBody(event.target.value)} />) : <div className="empty-note">No open note. Use ☰ to find or create one.</div>}
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
