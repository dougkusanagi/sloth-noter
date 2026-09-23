import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Markdown } from './markdown.jsx'
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

function uniqueName(notes, proposed) {
  const dot = proposed.toLowerCase().endsWith('.md') ? proposed.slice(0, -3) : proposed
  let name = `${dot}.md`, number = 2
  while (notes.some(note => note.name.toLocaleLowerCase() === name.toLocaleLowerCase())) name = `${dot} (${number++}).md`
  return name
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
  const [deleted, setDeleted] = useState(null)
  const search = useRef(null)
  const conflictFirst = useRef(null)
  const importInput = useRef(null)
  const importButton = useRef(null)
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
    closePalette()
  }
  function createNote(name = 'new note.md', body = '') {
    const old = current.current
    const note = { id: crypto.randomUUID(), name: uniqueName(old.notes, name), body, revision: 0 }
    commit({ ...old, notes: [...old.notes, note], openIds: [...old.openIds, note.id], activeId: note.id })
    setReading(false)
    closePalette()
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
    if (!active || !window.confirm(`Delete ${active.name}? You can undo this until you leave the page.`)) return
    const old = current.current
    setDeleted({ note: active, index: old.notes.findIndex(note => note.id === active.id) })
    const openIds = old.openIds.filter(id => id !== active.id)
    commit({ ...old, notes: old.notes.filter(note => note.id !== active.id), openIds, activeId: openIds.at(-1) ?? null })
  }
  function undoDelete() {
    if (!deleted) return
    const old = current.current
    const notes = [...old.notes]
    notes.splice(Math.min(deleted.index, notes.length), 0, deleted.note)
    const openIds = old.openIds.includes(deleted.note.id) ? old.openIds : [...old.openIds, deleted.note.id]
    commit({ ...old, notes, openIds, activeId: deleted.note.id })
    setDeleted(null)
  }
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
  function resolveConflict(replace) {
    if (!conflict) return
    if (replace) {
      const old = current.current
      commit({ ...old, notes: old.notes.map(note => note.id === conflict.id ? { ...note, body: conflict.body, revision: note.revision + 1 } : note), openIds: old.openIds.includes(conflict.id) ? old.openIds : [...old.openIds, conflict.id], activeId: conflict.id })
      setReading(false)
    } else createNote(conflict.name, conflict.body)
    closeConflict()
  }
  function closeConflict() { setConflict(null); setTimeout(() => importButton.current?.focus(), 0) }
  async function copyCode(source) {
    try { await navigator.clipboard.writeText(source); setCopyStatus('Copied') }
    catch { setCopyStatus('Could not copy') }
  }
  function openPalette() { returnFocus.current = document.activeElement; setQuery(''); setSelected(0); setPalette(true) }
  function closePalette() { setPalette(false); setTimeout(() => returnFocus.current?.focus(), 0) }
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
  useEffect(() => {
    const onKey = event => {
      if (conflict) { if (event.key === 'Escape') closeConflict(); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); openPalette() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') { event.preventDefault(); createNote() }
      if (event.key === 'Escape' && palette) closePalette()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return <main className="app" style={{ '--editor-size': `${prefs.fontSize}px` }}>
    {prefs.tabsVisible && <nav className="tabs" aria-label="Open notes"><div className="tab-list">{data.openIds.map(id => {
      const note = data.notes.find(item => item.id === id)
      return note && <div className="tab-item" key={id}><button className={id === data.activeId ? 'tab active' : 'tab'} onClick={() => openNote(id)}>{note.name}</button><button className="close-tab" aria-label={`Close ${note.name} tab`} onClick={() => closeTab(id)}>×</button></div>
    })}</div><button className="new-note" onClick={() => createNote()} aria-label="New note">+</button></nav>}
    <section className="editor-shell">
      <header><span className="vault">Saved in this browser</span><span className="save-state" role="status">{error ? 'Not saved' : 'Saved'}</span></header>
      {error && <div className="save-error" role="alert">Storage failed: {error}. Text stays in memory; export notes before closing.{blocked && <div><button onClick={() => download('sloth-note-damaged.json', initial.current.raw, 'application/json;charset=utf-8')}>Download stored data</button><button onClick={resetDamagedStorage}>Replace damaged storage with current notes</button></div>}</div>}
      {importError && <div className="save-error" role="alert">Import failed: {importError}</div>}
      <div className="toolbar"><button onClick={() => createNote()}>New note</button><button onClick={openPalette}>Find note</button><button ref={importButton} onClick={() => importInput.current?.click()}>Import .md</button><input ref={importInput} type="file" accept=".md,.markdown,text/markdown,text/plain" hidden onChange={event => { importFile(event.target.files?.[0]); event.target.value = '' }} /><button onClick={() => active && download(active.name, active.body)} disabled={!active}>Export .md</button><button onClick={renameNote} disabled={!active}>Rename</button><button onClick={() => setReading(value => !value)} disabled={!active}>{reading ? 'Edit' : 'Read'}</button><button onClick={() => updatePrefs({ tabsVisible: !prefs.tabsVisible })}>{prefs.tabsVisible ? 'Hide tabs' : 'Show tabs'}</button><button onClick={() => updatePrefs({ theme: prefs.theme === 'system' ? 'light' : prefs.theme === 'light' ? 'dark' : 'system' })}>Theme: {prefs.theme}</button><button onClick={() => updatePrefs({ fontSize: Math.max(14, prefs.fontSize - 1) })} aria-label="Decrease font size">A−</button><button onClick={() => updatePrefs({ fontSize: Math.min(24, prefs.fontSize + 1) })} aria-label="Increase font size">A+</button><button onClick={deleteNote} disabled={!active}>Delete</button>{deleted && <button onClick={undoDelete}>Undo delete</button>}</div>
      {active ? (reading ? <div className="reading"><Markdown text={active.body} onCopy={copyCode} />{copyStatus && <span role="status">{copyStatus}</span>}</div> : <textarea key={active.id} aria-label="Markdown editor" spellCheck="false" value={active.body} onChange={event => updateBody(event.target.value)} />) : <div className="empty-note">No open note. Find an existing note or create one.</div>}
      <div className="hint">Ctrl P find note · Ctrl T new note</div>
    </section>
    {palette && <div className="palette-backdrop" onMouseDown={closePalette}><section className="palette" role="dialog" aria-modal="true" aria-label="Find note" onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Tab') { const focusable = [search.current, ...event.currentTarget.querySelectorAll('button')]; const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } } }}><input ref={search} aria-label="Search notes" value={query} onChange={event => { setQuery(event.target.value); setSelected(0) }} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(index => Math.min(choices.length - 1, index + 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => Math.max(0, index - 1)) } if (event.key === 'Enter' && choices[selected]) openNote(choices[selected].id) }} placeholder="Find a note…" /><div className="results">{choices.length ? choices.map((note, index) => <button key={note.id} className={index === selected ? 'selected' : ''} aria-current={index === selected ? 'true' : undefined} onClick={() => openNote(note.id)}>{note.name}</button>) : <p>No notes found</p>}</div><button className="dialog-close" onClick={closePalette}>Close</button></section></div>}
    {conflict && <div className="palette-backdrop"><section className="palette conflict" role="dialog" aria-modal="true" aria-label="Import conflict" onKeyDown={event => { if (event.key === 'Escape') closeConflict(); if (event.key === 'Tab') { const buttons = [...event.currentTarget.querySelectorAll('button')]; if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus() } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus() } } }}><p>A note named <strong>{conflict.name}</strong> already exists.</p><button ref={conflictFirst} onClick={() => resolveConflict(false)}>Keep both</button><button onClick={() => resolveConflict(true)}>Replace existing note</button><button onClick={closeConflict}>Cancel</button></section></div>}
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
