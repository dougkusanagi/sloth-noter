import { markdownTree, walk, imageReferences } from '../markdown-model.js'
import { tableAt, tableDecorations } from './table.js'
import { addInlineDecorations } from './inline-decorations.js'
import { resolveImage } from '../images.js'
import { t } from '../i18n.js'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { classifyLine, inlineSyntax } from '../live-markdown.js'
import { codeTokens, syntaxRanges } from '../syntax-highlight.js'

class TaskWidget extends WidgetType {
  constructor(checked, at) {
    super()
    this.checked = checked
    this.at = at
  }
  eq(other) {
    return this.checked === other.checked && this.at === other.at
  }
  toDOM(view) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'task-checkbox cm-task-checkbox'
    input.setAttribute('aria-label', t(this.checked ? 'task.complete' : 'task.open'))
    input.addEventListener('change', () =>
      view.dispatch({
        changes: { from: this.at, to: this.at + 1, insert: input.checked ? 'x' : ' ' },
      }),
    )
    return input
  }
  ignoreEvent() {
    return true
  }
}
class ImageWidget extends WidgetType {
  constructor(src, alt) {
    super()
    this.src = src
    this.alt = alt
  }
  eq(other) {
    return this.src === other.src && this.alt === other.alt
  }
  toDOM() {
    const image = document.createElement('img')
    image.className = 'cm-image-preview'
    image.alt = this.alt
    resolveImage(this.src)
      .then((src) => {
        if (src) image.src = src
      })
      .catch(() => {})
    return image
  }
}

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
  if (/^\s+[-*+]/.test(line.text))
    attributes.style = `${attributes.style ?? ''};margin-left:${line.text.match(/^\s*/)[0].length}ch`
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
  const tree = markdownTree(doc.toString())
  const definitions = []
  walk(tree, (node) => {
    if (node.type === 'definition' || node.type === 'footnoteDefinition')
      definitions.push(doc.sliceString(node.position.start.offset, node.position.end.offset))
  })
  const definitionText = definitions.join('\n')
  const imageByLine = new Map(
    imageReferences(doc.toString()).map((image) => [
      (image.occurrence ?? image.node).position.start.line,
      image,
    ]),
  )
  const blockShapes = new Map()
  const fenceStarts = new Set(),
    fenceEnds = new Set()
  walk(tree, (node) => {
    if (node.type === 'code') {
      const first = node.position.start.line,
        last = node.position.end.line
      const opening = doc.line(first).text.match(/^\s{0,3}(`{3,}|~{3,})/)
      const closing =
        opening &&
        last > first &&
        new RegExp('^\\s{0,3}' + opening[1][0] + '{' + opening[1].length + ',}\\s*$').test(
          doc.line(last).text,
        )
      for (let number = first; number <= last; number++)
        blockShapes.set(number, {
          kind: (opening && number === first) || (closing && number === last) ? 'fence' : 'code',
          prefix:
            opening && number === first
              ? doc.line(number).length
              : closing && number === last
                ? doc.line(number).length
                : 0,
          language: node.lang ?? '',
        })
      if (opening) fenceStarts.add(first)
      if (closing) fenceEnds.add(last)
      if (selectedLines.some((range) => range.first <= last && range.last >= first)) {
        editing.add(first)
        if (closing) editing.add(last)
      }
    }
    if (node.type === 'heading' && node.position.end.line > node.position.start.line) {
      blockShapes.set(node.position.start.line, { kind: 'h' + node.depth, prefix: 0 })
      const last = node.position.end.line
      blockShapes.set(last, { kind: 'setext-marker', prefix: doc.line(last).length })
      if (editing.has(node.position.start.line) || editing.has(last)) {
        editing.add(node.position.start.line)
        editing.add(last)
      }
    }
  })
  for (const visible of view.visibleRanges) {
    const first = doc.lineAt(visible.from).number,
      last = doc.lineAt(visible.to).number
    for (let number = first; number <= last; number++) {
      const line = { ...doc.line(number), definitions: definitionText },
        shape = blockShapes.get(number) ?? classifyLine(line.text, false)
      if (shape.kind === 'code') {
        ranges.push(Decoration.line({ attributes: { class: 'cm-md-code' } }).range(line.from))
        for (const token of syntaxRanges(codeTokens(line.text, shape.language ?? '')).ranges) {
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
      const task = line.text.match(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s+/)
      if (task && !active) {
        ranges.push(Decoration.line({ attributes: { class: 'cm-md-paragraph' } }).range(line.from))
        ranges.push(
          Decoration.replace({
            widget: new TaskWidget(task[2].toLowerCase() === 'x', line.from + task[1].length + 1),
          }).range(line.from, line.from + task[0].length),
        )
        addInlineDecorations(ranges, line, { prefix: task[0].length }, false)
        continue
      }
      const image = imageByLine.get(number)
      if (
        image &&
        (image.occurrence ?? image.node).position.start.offset === line.from &&
        (image.occurrence ?? image.node).position.end.offset === line.to &&
        !active
      ) {
        ranges.push(
          Decoration.replace({ widget: new ImageWidget(image.src, image.name) }).range(
            line.from,
            line.to,
          ),
        )
        continue
      }
      const attrs = lineAttributes(line, shape, active)
      if (shape.kind === 'fence') {
        if (fenceStarts.has(number)) attrs.class += ' cm-md-fence-start'
        if (fenceEnds.has(number)) attrs.class += ' cm-md-fence-end'
      }
      if (active) {
        if (shape.kind === 'bullet') {
          const indent = line.text.match(/^\s*/)[0].length
          if (indent) ranges.push(Decoration.replace({}).range(line.from, line.from + indent))
          ranges.push(
            Decoration.mark({ class: 'cm-md-list-marker' }).range(
              line.from + indent,
              line.from + shape.prefix,
            ),
          )
        }
        if (number === 1) ranges.push(Decoration.replace({}).range(line.from, line.from + 2))
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
