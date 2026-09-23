import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { loadDocument, saveDocument } from './storage.js'
import './styles.css'

function Preview({ body }) {
  return <article className="markdown">{body.split('\n').map((line, index) => {
    if (line.startsWith('### ')) return <h3 key={index}>{line.slice(4)}</h3>
    if (line.startsWith('## ')) return <h2 key={index}>{line.slice(3)}</h2>
    if (line.startsWith('# ')) return <h1 key={index}>{line.slice(2)}</h1>
    return <p key={index}>{line || '\u00a0'}</p>
  })}</article>
}

function App() {
  const initial = useRef(null)
  if (!initial.current) initial.current = loadDocument(window.localStorage)
  const current = useRef(initial.current.document)
  const [data, setData] = useState(initial.current.document)
  const [error, setError] = useState(initial.current.error)
  const [reading, setReading] = useState(false)
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [tabs, setTabs] = useState(true)
  const [dark, setDark] = useState(false)
  const search = useRef(null)
  const active = data.notes.find(note => note.id === data.activeId) || data.notes[0]
  const choices = data.notes.filter(note => note.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  function commit(next) {
    current.current = next
    setData(next)
    setError(saveDocument(window.localStorage, next))
  }
  function createNote() {
    let number = 1, name = 'new note.md'
    while (current.current.notes.some(note => note.name === name)) name = `new note (${++number}).md`
    const note = { id: crypto.randomUUID(), name, body: '', revision: 0 }
    commit({ ...current.current, notes: [...current.current.notes, note], activeId: note.id })
    setReading(false)
    setPalette(false)
  }
  function selectNote(id) {
    commit({ ...current.current, activeId: id })
    setReading(false)
    setPalette(false)
  }
  function updateBody(body) {
    const old = current.current
    commit({ ...old, notes: old.notes.map(note => note.id === old.activeId ? { ...note, body, revision: note.revision + 1 } : note) })
  }
  function exportNote() {
    const url = URL.createObjectURL(new Blob([active.body], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = active.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function openPalette() { setQuery(''); setSelected(0); setPalette(true) }

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])
  useEffect(() => { if (palette) search.current?.focus() }, [palette])
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); openPalette() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') { event.preventDefault(); createNote() }
      if (event.key === 'Escape') setPalette(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return <main className="app">
    {tabs && <nav className="tabs" aria-label="Notes"><div className="tab-list">{data.notes.map(note => <button key={note.id} className={note.id === active.id ? 'tab active' : 'tab'} onClick={() => selectNote(note.id)}>{note.name}</button>)}</div></nav>}
    <section className="editor-shell">
      <header><span className="vault">Saved in this browser</span><span className="save-state" role="status">{error ? 'Not saved' : 'Saved'}</span></header>
      {error && <div className="save-error" role="alert">Storage failed: {error}. Your text is still here. Export a copy now.</div>}
      <div className="toolbar"><button onClick={createNote}>New note</button><button onClick={openPalette}>Find note</button><button onClick={() => setReading(value => !value)}>{reading ? 'Edit' : 'Read'}</button><button onClick={exportNote}>Export .md</button><button onClick={() => setTabs(value => !value)}>{tabs ? 'Hide tabs' : 'Show tabs'}</button><button onClick={() => setDark(value => !value)}>Theme</button></div>
      {reading ? <div className="reading"><Preview body={active.body} /></div> : <textarea key={active.id} aria-label="Markdown editor" value={active.body} onChange={event => updateBody(event.target.value)} />}
      <div className="hint">Ctrl P find note · Ctrl T new note</div>
    </section>
    {palette && <div className="palette-backdrop" onMouseDown={() => setPalette(false)}><section className="palette" role="dialog" aria-modal="true" aria-label="Find note" onMouseDown={event => event.stopPropagation()}><input ref={search} aria-label="Search notes" value={query} onChange={event => { setQuery(event.target.value); setSelected(0) }} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(index => Math.min(choices.length - 1, index + 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => Math.max(0, index - 1)) } if (event.key === 'Enter' && choices[selected]) selectNote(choices[selected].id) }} placeholder="Find a note…" /><div className="results">{choices.length ? choices.map((note, index) => <button key={note.id} className={index === selected ? 'selected' : ''} onClick={() => selectNote(note.id)}>{note.name}</button>) : <p>No notes found</p>}</div></section></div>}
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
