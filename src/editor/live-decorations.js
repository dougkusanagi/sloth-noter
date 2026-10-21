import { isolateHistory } from '@codemirror/commands'
import { markdownTree, walk, imageReferences } from '../markdown-model.js'
import { tableAt, tableDecorations } from './table.js'
import { addInlineDecorations } from './inline-decorations.js'
import { resolveImage } from '../images.js'
import { t } from '../i18n.js'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { classifyLine, inlineSyntax } from '../live-markdown.js'
import { headingSections } from '../sections.js'
import { FoldToggleWidget, foldField, foldRange, isFolded } from './folding.js'
import { codeTokens, syntaxRanges } from '../syntax-highlight.js'
import { sectionProgress, resolvedTasks, sectionChecklists, sectionTaskChanges } from '../tasks.js'
import { Facet } from '@codemirror/state'
import { progressBadge } from '../progress-badge.js'

const highlightedBlocks = new WeakMap()

export function selectionLineSignature(state) {
  return state.selection.ranges
    .map((range) => `${state.doc.lineAt(range.from).number}:${state.doc.lineAt(range.to).number}`)
    .join(',')
}

export const taskNotes = Facet.define({ combine: (values) => values[0] ?? [] })

class ProgressWidget extends WidgetType {
  constructor(done, total) {
    super()
    this.done = done
    this.total = total
  }
  eq(other) {
    return this.done === other.done && this.total === other.total
  }
  toDOM() {
    return progressBadge(this.done, this.total)
  }
}

class SectionChecklistWidget extends WidgetType {
  constructor(line, checklist) {
    super()
    this.line = line
    this.checklist = checklist
  }
  eq(other) {
    return (
      this.line === other.line && JSON.stringify(this.checklist) === JSON.stringify(other.checklist)
    )
  }
  toDOM(view) {
    const wrap = document.createElement('span')
    wrap.className = 'section-checklist'
    wrap.contentEditable = 'false'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.className = 'task-checkbox section-checkbox'
    input.addEventListener('mousedown', (event) => event.preventDefault())
    input.addEventListener('change', () => {
      const changes = sectionTaskChanges(
        view.state.doc.toString(),
        Number(input.dataset.line),
        input.checked,
        view.state.facet(taskNotes),
      )
      if (changes.length)
        view.dispatch({
          changes,
          userEvent: 'input.sectionTasks',
          annotations: isolateHistory.of('full'),
        })
    })
    wrap.append(input)
    this.updateDOM(wrap)
    return wrap
  }
  updateDOM(wrap) {
    const input = wrap.querySelector('input')
    const { done, total, partial, title } = this.checklist
    input.checked = done === total
    input.indeterminate = partial
    input.dataset.line = String(this.line)
    input.setAttribute('aria-checked', partial ? 'mixed' : String(input.checked))
    input.setAttribute('aria-label', t('task.sectionToggle', { title }))
    input.title = t(input.checked ? 'task.sectionClear' : 'task.sectionComplete', { title })
    return true
  }
  ignoreEvent() {
    return true
  }
}

class TaskWidget extends WidgetType {
  constructor(checked, at, partial = false, automatic = false) {
    super()
    this.checked = checked
    this.at = at
    this.partial = partial
    this.automatic = automatic
  }
  eq(other) {
    return (
      this.checked === other.checked &&
      this.at === other.at &&
      this.partial === other.partial &&
      this.automatic === other.automatic
    )
  }
  toDOM(view) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    this.updateDOM(input)
    input.className = 'task-checkbox cm-task-checkbox'
    input.addEventListener('change', () =>
      view.dispatch({
        changes: {
          from: Number(input.dataset.mark),
          to: Number(input.dataset.mark) + 1,
          insert: input.checked ? 'x' : ' ',
        },
      }),
    )
    return input
  }
  updateDOM(input) {
    input.checked = this.checked
    input.indeterminate = this.partial
    input.disabled = this.automatic
    input.setAttribute('aria-checked', this.partial ? 'mixed' : String(this.checked))
    input.dataset.mark = String(this.at)
    input.setAttribute('aria-label', t(this.checked ? 'task.complete' : 'task.open'))
    return true
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

/** How far a list item is pushed in: one step per enclosing item, whatever the source spaces. */
export const listMargin = (depth) => `margin-left:calc(${depth} * var(--editor-size) * 1.5)`

export function lineAttributes(line, shape, active, listDepth = 0) {
  const classes = [shape.kind === 'paragraph' ? 'cm-md-paragraph' : `cm-md-${shape.kind}`]
  if (active) classes.push('cm-md-editing')
  if (shape.prefix && shape.kind !== 'fence') classes.push('cm-md-prefix')
  if (shape.depth > 1) classes.push('cm-md-quote-nested')
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
  if (listDepth) attributes.style = `${attributes.style ?? ''};${listMargin(listDepth)}`
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
  const text = doc.toString()
  const tree = markdownTree(text)
  const foldable = new Map()
  for (const heading of headingSections(text, tree)) {
    const range = heading.level > 0 && foldRange(view.state, heading)
    if (range) foldable.set(heading.line, isFolded(view.state, range.from))
  }
  const collapsed = new Set([...foldable].filter(([, folded]) => folded).map(([line]) => line))
  const tasks = new Map(
    resolvedTasks(text, view.state.facet(taskNotes)).map((task) => [task.line, task]),
  )
  const progress = sectionProgress(text, [...tasks.values()], collapsed)
  const checklists = sectionChecklists(text, [...tasks.values()])
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
  const breakMarks = new Map()
  const listDepths = new Map()
  const continuations = new Map()
  const collectLists = (node, depth) => {
    if (node.type === 'listItem') {
      listDepths.set(node.position.start.line, depth)
      for (let line = node.position.start.line + 1; line <= node.position.end.line; line++)
        continuations.set(line, depth + 1)
    }
    for (const child of node.children ?? [])
      collectLists(child, node.type === 'listItem' ? depth + 1 : depth)
  }
  collectLists(tree, 0)
  const blockShapes = new Map()
  const fenceStarts = new Set(),
    fenceEnds = new Set()
  const codeBlocks = new Map()
  const codeRangesByLine = new Map()
  walk(tree, (node) => {
    if (
      node.type === 'break' &&
      doc.sliceString(node.position.start.offset, node.position.start.offset + 1) === '\\'
    )
      breakMarks.set(node.position.start.line, node.position.start.offset)
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
      const contentFrom = opening ? doc.line(first).to + 1 : doc.line(first).from
      const contentTo = closing ? doc.line(last).from : doc.line(last).to
      if (contentFrom < contentTo) {
        let tokens = highlightedBlocks.get(node)
        if (!tokens) {
          tokens = syntaxRanges(
            codeTokens(doc.sliceString(contentFrom, contentTo), node.lang ?? ''),
            contentFrom,
          ).ranges
          highlightedBlocks.set(node, tokens)
        }
        for (const token of tokens) {
          const startLine = doc.lineAt(token.from).number
          const endLine = doc.lineAt(token.to - 1).number
          for (let number = startLine; number <= endLine; number++) {
            const line = doc.line(number)
            const from = Math.max(token.from, line.from)
            const to = Math.min(token.to, line.to)
            if (from >= to) continue
            if (!codeRangesByLine.has(number)) codeRangesByLine.set(number, [])
            codeRangesByLine.get(number).push({ ...token, from, to })
          }
        }
      }
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
      if (opening) {
        fenceStarts.add(first)
        codeBlocks.set(first, { source: node.value, language: node.lang ?? '' })
      }
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
        for (const token of codeRangesByLine.get(number) ?? []) {
          ranges.push(
            Decoration.mark({ class: token.types.map((type) => `syntax-${type}`).join(' ') }).range(
              token.from,
              token.to,
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
      const task = line.text.match(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX-])\](?:\s+|$)/)
      if (task) {
        ranges.push(
          Decoration.line({
            attributes: {
              class: `cm-md-paragraph cm-md-task${active ? ' cm-md-editing' : ''}`,
              ...(listDepths.get(number) ? { style: listMargin(listDepths.get(number)) } : {}),
            },
          }).range(line.from),
        )
        if (active) {
          ranges.push(
            Decoration.mark({ class: 'cm-task-source-marker' }).range(
              line.from,
              line.from + task[0].length,
            ),
          )
        } else
          ranges.push(
            Decoration.replace({
              widget: new TaskWidget(
                tasks.get(number)?.done ?? false,
                line.from + task[1].length + 1,
                tasks.get(number)?.partial,
                Boolean(tasks.get(number)?.progress),
              ),
            }).range(line.from, line.from + task[0].length),
          )
        const linked = tasks.get(number)?.progress
        if (linked)
          ranges.push(
            Decoration.widget({
              widget: new ProgressWidget(linked.done, linked.total),
              side: 1,
            }).range(line.to),
          )
        addInlineDecorations(ranges, line, { prefix: task[0].length }, active)
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
      if (!active && breakMarks.has(number))
        ranges.push(
          Decoration.replace({}).range(breakMarks.get(number), breakMarks.get(number) + 1),
        )
      if (foldable.has(number))
        ranges.push(
          Decoration.widget({
            widget: new FoldToggleWidget(number, foldable.get(number)),
            side: -2,
          }).range(line.from),
        )
      const indent = line.text.match(/^\s*/)[0].length
      // The margin carries the nesting, so the source spaces never show.
      if (shape.kind === 'ordered' && indent && listDepths.has(number))
        ranges.push(Decoration.replace({}).range(line.from, line.from + indent))
      const attrs = lineAttributes(line, shape, active, listDepths.get(number))
      if (shape.kind === 'paragraph' && continuations.has(number) && !listDepths.has(number)) {
        // Text continuing a list item lines up with the item's own text.
        if (indent) ranges.push(Decoration.replace({}).range(line.from, line.from + indent))
        attrs.style = `${attrs.style ?? ''};${listMargin(continuations.get(number))}`
      }
      const block = codeBlocks.get(number)
      if (block) {
        attrs.class += ' cm-code-copy-anchor'
      }
      if (shape.kind === 'fence') {
        if (fenceStarts.has(number)) attrs.class += ' cm-md-fence-start'
        if (fenceEnds.has(number)) attrs.class += ' cm-md-fence-end'
      }
      const checklist = checklists.get(number)
      if (checklist)
        ranges.push(
          Decoration.widget({
            widget: new SectionChecklistWidget(number, checklist),
            side: -1,
          }).range(line.from),
        )
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
      const section = progress.get(number)
      if (section)
        ranges.push(
          Decoration.widget({
            widget: new ProgressWidget(section.done, section.total),
            side: -1,
          }).range(line.to),
        )
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
      if (
        update.startState.facet(taskNotes) !== update.state.facet(taskNotes) ||
        update.docChanged ||
        (update.selectionSet &&
          selectionLineSignature(update.startState) !== selectionLineSignature(update.state)) ||
        update.viewportChanged ||
        update.startState.field(foldField) !== update.state.field(foldField)
      )
        this.decorations = decorationsFor(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
