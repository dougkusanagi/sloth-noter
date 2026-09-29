import { tableAt, tableDecorations } from './table.js'
import { addInlineDecorations } from './inline-decorations.js'
import { Decoration, ViewPlugin } from '@codemirror/view'
import { classifyLine, inlineSyntax } from '../live-markdown.js'
import { codeTokens, syntaxRanges } from '../syntax-highlight.js'

export function lineAttributes(line, shape, active) {
  const classes = [shape.kind === 'paragraph' ? 'cm-md-paragraph' : `cm-md-${shape.kind}`]
  if (active) classes.push('cm-md-editing')
  if (shape.prefix && shape.kind !== 'fence') classes.push('cm-md-prefix')
  const syntax =
    shape.kind === 'fence' || shape.kind === 'code' || shape.kind === 'paragraph'
      ? []
      : inlineSyntax(line.text.slice(shape.prefix))
  const reserve = syntax.reduce(
    (length, token) => length + token.contentStart - token.start + token.end - token.contentEnd,
    0,
  )
  if (reserve) classes.push('cm-md-syntax')
  const attributes = { class: classes.join(' ') }
  if (reserve) attributes.style = `--md-syntax-reserve:${reserve}ch`
  return attributes
}

export function decorationsFor(view) {
  const doc = view.state.doc,
    ranges = []
  const editing = new Set(),
    selectedLines = []
  for (const selection of view.state.selection.ranges) {
    const first = doc.lineAt(selection.from).number,
      last = doc.lineAt(selection.to).number
    selectedLines.push({ first, last })
    for (let number = first; number <= last; number++) editing.add(number)
  }
  let openFence = null
  const fenceStarts = new Set(),
    fenceEnds = new Set()
  for (let number = 1; number <= doc.lines; number++) {
    if (!doc.line(number).text.startsWith('```')) continue
    if (openFence === null) openFence = number
    else {
      if (selectedLines.some((range) => range.first <= number && range.last >= openFence)) {
        editing.add(openFence)
        editing.add(number)
      }
      fenceStarts.add(openFence)
      fenceEnds.add(number)
      openFence = null
    }
  }
  if (openFence !== null && selectedLines.some((range) => range.last >= openFence))
    editing.add(openFence)
  if (openFence !== null) fenceStarts.add(openFence)
  for (const visible of view.visibleRanges) {
    const first = doc.lineAt(visible.from).number,
      last = doc.lineAt(visible.to).number
    let inFence = false,
      fenceLanguage = ''
    for (let number = 1; number < first; number++) {
      if (doc.line(number).text.startsWith('```')) {
        inFence = !inFence
        fenceLanguage = inFence ? doc.line(number).text.slice(3).trim() : ''
      }
    }
    for (let number = first; number <= last; number++) {
      const line = doc.line(number),
        shape = classifyLine(line.text, inFence)
      inFence = shape.nextFence
      if (shape.kind === 'fence') fenceLanguage = inFence ? line.text.slice(3).trim() : ''
      if (shape.kind === 'code') {
        ranges.push(Decoration.line({ attributes: { class: 'cm-md-code' } }).range(line.from))
        for (const token of syntaxRanges(codeTokens(line.text, fenceLanguage)).ranges) {
          ranges.push(
            Decoration.mark({ class: token.types.map((type) => `syntax-${type}`).join(' ') }).range(
              line.from + token.from,
              line.from + token.to,
            ),
          )
        }
        continue
      }
      const table = shape.kind === 'table' ? tableAt(doc, number) : null
      if (table) {
        tableDecorations(ranges, view, line, number, table)
        continue
      }
      const active = editing.has(number)
      const attrs = lineAttributes(line, shape, active)
      if (shape.kind === 'fence') {
        if (fenceStarts.has(number)) attrs.class += ' cm-md-fence-start'
        if (fenceEnds.has(number)) attrs.class += ' cm-md-fence-end'
      }
      if (active) {
        ranges.push(Decoration.line({ attributes: attrs }).range(line.from))
        if (shape.kind !== 'fence' && shape.kind !== 'table')
          addInlineDecorations(ranges, line, shape, true)
        continue
      }
      ranges.push(Decoration.line({ attributes: attrs }).range(line.from))
      if (shape.prefix)
        ranges.push(Decoration.replace({}).range(line.from, line.from + shape.prefix))
      if (shape.kind === 'fence') continue
      addInlineDecorations(ranges, line, shape, false)
    }
  }
  return Decoration.set(ranges, true)
}

export const liveMarkdown = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = decorationsFor(view)
    }
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged)
        this.decorations = decorationsFor(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
