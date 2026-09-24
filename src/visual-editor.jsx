import { useEffect, useRef, useState } from 'react'
import { EditorSelection, EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Decoration, EditorView, ViewPlugin, keymap } from '@codemirror/view'
import { classifyLine, inlineSyntax } from './live-markdown.js'
import { wrapSelection } from './wrap-selection.js'
import { activeFormats, formatSelection } from './format-selection.js'
import { blockTemplate } from './insert-block.js'

const formatButtons = [
  ['bold', 'Negrito', <strong>B</strong>],
  ['italic', 'Itálico', <em>I</em>],
  ['code', 'Código em linha', <span className="format-code">&lt;/&gt;</span>],
  ['link', 'Link', <span aria-hidden="true">↗</span>],
  ['heading', 'Título 2', <span>H₂</span>],
  ['quote', 'Citação', <span>❝</span>],
  ['list', 'Lista', <span>☷</span>],
]
const blockButtons = [
  ['h2', 'Título 2'], ['h3', 'Título 3'], ['h4', 'Título 4'],
  ['quote', 'Citação'], ['list', 'Lista com marcadores'], ['numbered', 'Lista numerada'],
  ['table', 'Tabela'], ['code', 'Bloco de código'],
]

function wrapSelectedText(event, view) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false
  const ranges = view.state.selection.ranges
  if (!ranges.some(range => !range.empty)) return false
  const changes = [], selections = []
  for (const range of ranges) {
    const wrapped = wrapSelection(view.state.doc.sliceString(range.from, range.to), 0, range.to - range.from, event.key)
    if (!wrapped) return false
    changes.push({ from: range.from, to: range.to, insert: wrapped.insert })
  }
  let offset = 0
  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index], insert = changes[index].insert
    selections.push(EditorSelection.range(range.from + offset + 1, range.from + offset + insert.length - 1))
    offset += insert.length - (range.to - range.from)
  }
  view.dispatch({ changes, selection: EditorSelection.create(selections, view.state.selection.mainIndex), userEvent: 'input.type' })
  event.preventDefault()
  return true
}

function decorationsFor(view) {
  const doc = view.state.doc, ranges = []
  const editing = new Set()
  for (const selection of view.state.selection.ranges) {
    const first = doc.lineAt(selection.from).number, last = doc.lineAt(selection.to).number
    for (let number = first; number <= last; number++) editing.add(number)
  }
  for (const visible of view.visibleRanges) {
    const first = doc.lineAt(visible.from).number, last = doc.lineAt(visible.to).number
    let inFence = false
    for (let number = 1; number < first; number++) {
      if (doc.line(number).text.startsWith('```')) inFence = !inFence
    }
    for (let number = first; number <= last; number++) {
      const line = doc.line(number), shape = classifyLine(line.text, inFence)
      inFence = shape.nextFence
      if (editing.has(number)) continue
      if (shape.kind !== 'paragraph') ranges.push(Decoration.line({ attributes: { class: `cm-md-${shape.kind}` } }).range(line.from))
      if (shape.prefix) ranges.push(Decoration.replace({}).range(line.from, line.from + shape.prefix))
      if (shape.kind === 'code' || shape.kind === 'fence') continue
      const offset = line.from + shape.prefix
      for (const token of inlineSyntax(line.text.slice(shape.prefix))) {
        const start = offset + token.start, end = offset + token.end
        const contentStart = offset + token.contentStart, contentEnd = offset + token.contentEnd
        if (start < contentStart) ranges.push(Decoration.replace({}).range(start, contentStart))
        ranges.push(Decoration.mark({ class: `cm-md-inline-${token.kind}` }).range(contentStart, contentEnd))
        if (contentEnd < end) ranges.push(Decoration.replace({}).range(contentEnd, end))
      }
    }
  }
  return Decoration.set(ranges, true)
}

const liveMarkdown = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = decorationsFor(view) }
  update(update) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = decorationsFor(update.view)
  }
}, { decorations: plugin => plugin.decorations })

export function VisualEditor({ noteId, body, onChange, onReady }) {
  const host = useRef(null), viewRef = useRef(null), syncing = useRef(false)
  const [toolbar, setToolbar] = useState(null)
  const [insertAt, setInsertAt] = useState(null)
  const [blockMenu, setBlockMenu] = useState(false)
  const blockMenuRef = useRef(false)
  blockMenuRef.current = blockMenu
  const [linkEditing, setLinkEditing] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const linkInput = useRef(null)
  const callbacks = useRef({ onChange, onReady })
  callbacks.current = { onChange, onReady }

  function positionToolbar(view) {
    const selection = view.state.selection.main
    if (selection.empty || !view.hasFocus) { setToolbar(null); return }
    const start = view.coordsAtPos(selection.from), end = view.coordsAtPos(selection.to)
    if (!start || !end) { setToolbar(null); return }
    if (start.top < 48 || start.top > window.innerHeight) { setToolbar(null); return }
    const margin = Math.min(124, window.innerWidth / 2)
    const x = Math.max(margin, Math.min(window.innerWidth - margin, (start.left + end.right) / 2))
    const y = start.top > 55 ? start.top - 8 : end.bottom + 8
    setToolbar({ x, y, below: start.top <= 55, active: activeFormats(view.state.doc.toString(), selection.from, selection.to) })
  }

  function positionInsert(view, position = view.state.selection.main.head) {
    if (!view.state.selection.main.empty) { setInsertAt(null); setBlockMenu(false); return }
    const line = view.state.doc.lineAt(position)
    if (line.text.trim()) { if (!blockMenuRef.current) setInsertAt(null); return }
    const coords = view.coordsAtPos(line.from)
    if (!coords || coords.top < 48 || coords.top > window.innerHeight) { if (!blockMenuRef.current) setInsertAt(null); return }
    setInsertAt({ from: line.from, x: Math.max(5, coords.left - 34), y: coords.top })
  }

  function insertBlock(action) {
    const view = viewRef.current, template = blockTemplate(action)
    if (!view || !template || !insertAt) return
    view.dispatch({ changes: { from: insertAt.from, insert: template.text }, selection: EditorSelection.single(insertAt.from + template.selectionFrom, insertAt.from + template.selectionTo), userEvent: 'input.type' })
    setBlockMenu(false)
    setInsertAt(null)
    view.focus()
  }

  function applyFormat(action, url = '') {
    const view = viewRef.current
    if (!view) return
    const selection = view.state.selection.main
    const result = formatSelection(view.state.doc.toString(), selection.from, selection.to, action, url)
    if (!result) return
    view.dispatch({ changes: { from: result.from, to: result.to, insert: result.insert }, selection: EditorSelection.single(result.selectionFrom, result.selectionTo), userEvent: 'input.type' })
    view.focus()
    setLinkEditing(false)
    setLinkUrl('')
    positionToolbar(view)
  }

  useEffect(() => { if (linkEditing) linkInput.current?.focus() }, [linkEditing])
  useEffect(() => { if (blockMenu) host.current?.querySelector('.block-menu button')?.focus() }, [blockMenu])

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: body,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Editor Markdown visual', spellcheck: 'false' }),
          EditorView.domEventHandlers({
            keydown: wrapSelectedText,
            focus: (_event, view) => { positionToolbar(view); positionInsert(view); return false },
            blur: event => { if (!event.relatedTarget?.closest?.('.format-toolbar')) setToolbar(null); if (!event.relatedTarget?.closest?.('.insert-trigger, .block-menu')) { setInsertAt(null); setBlockMenu(false) } return false },
            mousemove: (event, view) => { if (!blockMenuRef.current) { const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }); if (pos !== null) positionInsert(view, pos) } return false },
          }),
          liveMarkdown,
          EditorView.updateListener.of(update => {
            if (update.docChanged && !syncing.current) callbacks.current.onChange(update.state.doc.toString())
            if (update.selectionSet || update.docChanged || update.viewportChanged) { positionToolbar(update.view); positionInsert(update.view) }
          }),
        ],
      }),
      parent: host.current,
    })
    viewRef.current = view
    view.scrollDOM.addEventListener('scroll', () => { positionToolbar(view); positionInsert(view) })
    callbacks.current.onReady(view)
    return () => { callbacks.current.onReady(null); viewRef.current = null; view.destroy() }
  }, [noteId])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === body) return
    syncing.current = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: body } })
    syncing.current = false
  }, [body])

  return <div className="visual-editor" ref={host}>
    {toolbar && <div className={`format-toolbar${toolbar.below ? ' below' : ''}`} role="toolbar" aria-label="Formatação do texto selecionado" style={{ left: toolbar.x, top: toolbar.y }} onMouseDown={event => { if (!event.target.closest('input')) event.preventDefault() }}>
      {linkEditing ? <form className="format-link" onSubmit={event => { event.preventDefault(); applyFormat('link', linkUrl) }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setLinkEditing(false); viewRef.current?.focus() } }}>
        <input ref={linkInput} aria-label="Endereço do link" type="text" inputMode="url" placeholder="https://..." value={linkUrl} onChange={event => setLinkUrl(event.target.value)} required />
        <button type="submit" aria-label="Aplicar link" title="Aplicar link">↗</button>
      </form> : formatButtons.map(([action, label, icon]) => <button key={action} type="button" title={label} aria-label={label} aria-pressed={toolbar.active.includes(action)} className={toolbar.active.includes(action) ? 'active' : undefined} onClick={() => action === 'link' && !toolbar.active.includes('link') ? setLinkEditing(true) : applyFormat(action)}>{icon}</button>)}
    </div>}
    {insertAt && <>
      <button type="button" className="insert-trigger" aria-label="Inserir bloco" aria-expanded={blockMenu} title="Inserir bloco" style={{ left: insertAt.x, top: insertAt.y }} onMouseDown={event => event.preventDefault()} onClick={() => setBlockMenu(value => !value)}>+</button>
      {blockMenu && <div className="block-menu" role="menu" aria-label="Inserir bloco" style={{ left: Math.max(8, insertAt.x), top: Math.max(52, Math.min(insertAt.y + 30, window.innerHeight - Math.min(350, window.innerHeight * .6) - 8)) }} onMouseDown={event => event.preventDefault()} onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll('button')]
        const index = buttons.indexOf(document.activeElement)
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus() }
        if (event.key === 'Home') { event.preventDefault(); buttons[0]?.focus() }
        if (event.key === 'End') { event.preventDefault(); buttons.at(-1)?.focus() }
        if (event.key === 'Escape') { event.preventDefault(); setBlockMenu(false); viewRef.current?.focus() }
        if (event.key === 'Tab') setBlockMenu(false)
      }}>
        {blockButtons.map(([action, label]) => <button key={action} type="button" role="menuitem" onClick={() => insertBlock(action)}>{label}</button>)}
      </div>}
    </>}
  </div>
}
