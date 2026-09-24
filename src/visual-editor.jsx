import { useEffect, useRef } from 'react'
import { EditorSelection, EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Decoration, EditorView, ViewPlugin, keymap } from '@codemirror/view'
import { classifyLine, inlineSyntax } from './live-markdown.js'
import { wrapSelection } from './wrap-selection.js'

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
  const callbacks = useRef({ onChange, onReady })
  callbacks.current = { onChange, onReady }

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: body,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Editor Markdown visual', spellcheck: 'false' }),
          EditorView.domEventHandlers({ keydown: wrapSelectedText }),
          liveMarkdown,
          EditorView.updateListener.of(update => {
            if (update.docChanged && !syncing.current) callbacks.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
      parent: host.current,
    })
    viewRef.current = view
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

  return <div className="visual-editor" ref={host} />
}
