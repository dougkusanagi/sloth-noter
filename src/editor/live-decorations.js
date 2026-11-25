import { noteCover } from '../note-cover.js'
import { readCallout } from '../callout.js'
import { accordionBlocks } from '../accordion.js'
import { moveListItems } from '../list-move.js'
import { platform } from '../platform.js'
import { sheetField } from './sheet.js'
import { isolateHistory } from '@codemirror/commands'
import { markdownTree, walk, imageReferences } from '../markdown-model.js'
import {
  isTableFlagsLine,
  tableAt,
  tableDecorations,
  tableSelectionColumn,
  tableUiField,
} from './table.js'
import { parseTableLine } from '../markdown-table.js'
import { addInlineDecorations } from './inline-decorations.js'
import { resolveImage } from '../images.js'
import { currentLanguage, t } from '../i18n.js'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import { classifyLine, inlineSyntax } from '../live-markdown.js'
import { headingSections } from '../sections.js'
import { FoldToggleWidget, foldField, foldRange, isFolded } from './folding.js'
import { codeTokens, syntaxRanges } from '../syntax-highlight.js'
import {
  sectionProgress,
  resolvedTasks,
  sectionChecklists,
  sectionTaskChanges,
  taskSettings,
  taskStatusChanges,
} from '../tasks.js'
import { Facet } from '@codemirror/state'
import { progressBadge } from '../progress-badge.js'
import { taskDateLabel, taskDates, taskDueState, taskStampText } from '../task-dates.js'
import { onLongPress, openTaskMenu } from './task-menu.js'
import { unarchiveTask } from '../task-archive.js'
import { documentChanges } from '../search-scope.js'
import { hideFrontmatter } from './hide-frontmatter.js'
import { blockGaps } from './block-gaps.js'
import { readProperties, titleLineNumber } from '../frontmatter.js'
import { embeddedDocument } from './embedded.js'
import { lineVariables, resolveVariable } from '../variables.js'

const TASK_PREFIX = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX]|[^\w\s[\]])\](?:\s+|$)/
const highlightedBlocks = new WeakMap()

export function selectionLineSignature(state) {
  return state.selection.ranges
    .map((range) => {
      const line = state.doc.lineAt(range.head)
      const parsed = parseTableLine(line.text)
      const column = parsed ? tableSelectionColumn({ state }, line, parsed) : -1
      const startLine = state.doc.lineAt(range.from)
      const prefix = TASK_PREFIX.exec(startLine.text)
      const inTaskMarker = prefix && range.from < startLine.from + prefix[0].length
      return `${startLine.number}:${state.doc.lineAt(range.to).number}:${range.empty}:${Boolean(inTaskMarker)}:${column}`
    })
    .join(',')
}

let lastBlock = null
let lastReadable = false
function frontmatterReadable(block) {
  if (block !== lastBlock) {
    lastBlock = block
    lastReadable = readProperties(block).ok
  }
  return lastReadable
}

export const staticDocument = Facet.define({ combine: (values) => values[0] ?? false })
export const taskNotes = Facet.define({ combine: (values) => values[0] ?? [] })
/** Id of the note shown, so variables such as `{{updated}}` can read its data. */
export const activeNoteId = Facet.define({ combine: (values) => values[0] ?? null })

class CalloutTitleWidget extends WidgetType {
  constructor(title) {
    super()
    this.title = title
  }
  eq(other) {
    return this.title === other.title
  }
  toDOM() {
    const title = document.createElement('span')
    title.textContent = this.title
    return title
  }
  ignoreEvent() {
    return false
  }
}

class VariableWidget extends WidgetType {
  constructor(text, raw) {
    super()
    this.text = text
    this.raw = raw
  }
  eq(other) {
    return this.text === other.text && this.raw === other.raw
  }
  toDOM() {
    const chip = document.createElement('span')
    chip.className = 'cm-variable'
    chip.title = this.raw
    chip.textContent = this.text
    return chip
  }
}

/** Keep the optional description on the second line, even after it is skipped. */
export function emptyBodyLine(state) {
  if (state.facet(embeddedDocument)) return 0
  const body = titleLineNumber(state.doc) + 1
  return state.doc.lines >= body && !state.doc.line(body).text ? body : 0
}

/** A note with only its title: the optional description and everything below are empty. */
export function emptyNoteBody(state) {
  if (state.doc.lines === titleLineNumber(state.doc)) return true
  const line = emptyBodyLine(state)
  return line > 0 && state.doc.sliceString(state.doc.line(line).to).trim() === ''
}

class EmptyBodyWidget extends WidgetType {
  constructor(text) {
    super()
    this.text = text
  }
  eq(other) {
    return this.text === other.text
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-empty-body-after'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = this.text
    return span
  }
}

class ProgressWidget extends WidgetType {
  constructor({ done, total, doing = 0, waiting = 0 }) {
    super()
    this.done = done
    this.total = total
    this.doing = doing
    this.waiting = waiting
  }
  eq(other) {
    return (
      this.done === other.done &&
      this.total === other.total &&
      this.doing === other.doing &&
      this.waiting === other.waiting
    )
  }
  toDOM() {
    return progressBadge(this.done, this.total, this.doing, this.waiting)
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
          userEvent: 'tarefa',
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

/** The `✅ AAAA-MM-DD` suffix of a task, drawn as a date badge in the active locale. */
class TaskDateWidget extends WidgetType {
  constructor(stamp) {
    super()
    this.stamp = stamp
  }
  eq(other) {
    return this.stamp.iso === other.stamp.iso && this.stamp.kind === other.stamp.kind
  }
  toDOM() {
    const badge = document.createElement('time')
    badge.className = 'task-date'
    badge.dataset.kind = this.stamp.kind
    if (this.stamp.kind === 'due') badge.dataset.state = taskDueState(this.stamp.iso)
    badge.dateTime = this.stamp.iso
    badge.title = taskDateLabel(this.stamp)
    badge.setAttribute('aria-label', badge.title)
    badge.textContent = taskStampText(this.stamp)
    return badge
  }
  ignoreEvent() {
    return false
  }
}

class TaskMoveHint extends WidgetType {
  toDOM() {
    const hint = document.createElement('kbd')
    hint.className = 'cm-task-move-hint'
    hint.textContent = 'Ctrl+Shift+↑/↓'
    hint.setAttribute('aria-label', t('task.moveHint'))
    return hint
  }
}

class TaskWidget extends WidgetType {
  constructor(checked, at, partial = false, automatic = false, status = 'todo', archived = false) {
    super()
    this.archived = archived
    this.status = status
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
      this.automatic === other.automatic &&
      this.status === other.status &&
      this.archived === other.archived
    )
  }
  toDOM(view) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    this.updateDOM(input)
    input.className = 'task-checkbox cm-task-checkbox'
    input.addEventListener('mousedown', (event) => event.preventDefault())
    const openMenu = (x, y) => {
      if (input.disabled) return
      const mark = Number(input.dataset.mark)
      openTaskMenu({
        x,
        y,
        current: input.dataset.status,
        restoreFocus: () => view.focus(),
        onUnarchive:
          input.dataset.archived === undefined
            ? undefined
            : () => {
                const text = view.state.doc.toString()
                const next = unarchiveTask(text, mark)
                if (next !== text)
                  view.dispatch({ changes: documentChanges(text, next), userEvent: 'tarefa' })
              },
        onSelect: (status) => {
          const changes = taskStatusChanges(view.state.doc.toString(), mark, status, taskSettings)
          if (changes.length) view.dispatch({ changes, userEvent: 'tarefa' })
        },
      })
    }
    input.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      const box = input.getBoundingClientRect()
      openMenu(event.clientX || box.left, event.clientY || box.bottom)
    })
    onLongPress(input, openMenu)
    input.addEventListener('change', () =>
      view.dispatch({
        changes: taskStatusChanges(
          view.state.doc.toString(),
          Number(input.dataset.mark),
          input.checked ? 'done' : 'todo',
          taskSettings,
        ),
        userEvent: 'tarefa',
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
    input.dataset.status = this.status
    if (this.archived) input.dataset.archived = ''
    else delete input.dataset.archived
    input.setAttribute('aria-label', t(this.checked ? 'task.complete' : 'task.open'))
    return true
  }
  ignoreEvent() {
    return true
  }
}
class ImageWidget extends WidgetType {
  constructor(src, alt, title = '', cover = false) {
    super()
    this.src = src
    this.alt = alt
    this.title = title
    this.cover = cover
  }
  eq(other) {
    return (
      this.src === other.src &&
      this.alt === other.alt &&
      this.title === other.title &&
      this.cover === other.cover
    )
  }
  toDOM() {
    const image = document.createElement('img')
    image.className = 'cm-image-preview'
    image.alt = this.alt
    const resolve = resolveImage(this.src)
    if (this.cover) {
      const frame = document.createElement('span')
      frame.className = 'note-cover'
      const status = document.createElement('span')
      status.className = 'image-missing'
      const missing = () => {
        image.remove()
        status.textContent = t('cover.unavailable')
      }
      image.hidden = true
      image.addEventListener(
        'load',
        () => {
          image.hidden = false
          status.remove()
        },
        { once: true },
      )
      image.addEventListener('error', missing, { once: true })
      frame.append(image, status)
      resolve.then((src) => {
        if (src) image.src = src
        else missing()
      }, missing)
      return frame
    }
    resolve
      .then((src) => {
        if (src) image.src = src
      })
      .catch(() => {})
    if (!this.title) return image
    // The Markdown title is the caption: the same text appears under the image in Leitura.
    const figure = document.createElement('span')
    figure.className = 'cm-image-figure'
    const caption = document.createElement('span')
    caption.className = 'cm-image-caption'
    caption.textContent = this.title
    figure.append(image, caption)
    return figure
  }
}

/** How far a list item is pushed in: one step per enclosing item, whatever the source spaces. */
export const listMargin = (depth) => `margin-left:calc(${depth} * var(--editor-size) * 1.5)`

export function lineAttributes(line, shape, active, listDepth = 0) {
  const classes = [shape.kind === 'paragraph' ? 'cm-md-paragraph' : `cm-md-${shape.kind}`]
  if (shape.kind === 'paragraph' && !line.text.trim()) classes.push('cm-md-blank')
  if (active) classes.push('cm-md-editing')
  if (shape.kind === 'bullet' && listDepth) classes.push(`cm-md-depth-${Math.min(listDepth, 2)}`)
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

// Scrolling changes the visible ranges, but the document-wide Markdown analysis
// only changes with the document, task notes or folded sections.
const markdownByView = new WeakMap()

function documentDecorations(view) {
  const { state } = view
  const doc = state.doc
  const notes = state.facet(taskNotes)
  const folds = state.field(foldField)
  const cached = markdownByView.get(view)
  if (cached?.doc === doc && cached.notes === notes && cached.folds === folds) return cached

  const text = doc.toString()
  const tree = markdownTree(text)
  const foldable = new Map()
  for (const heading of headingSections(text, tree)) {
    const range = heading.level > 0 && foldRange(view.state, heading)
    if (range) foldable.set(heading.line, isFolded(view.state, range.from))
  }
  const accordionLines = new Map()
  for (const accordion of accordionBlocks(text, tree)) {
    accordionLines.set(accordion.line, accordion)
    accordionLines.set(accordion.titleEnd, accordion)
    accordionLines.set(accordion.end, accordion)
    if (accordion.end - 1 > accordion.titleEnd && !doc.line(accordion.end - 1).text.trim())
      accordionLines.set(accordion.end - 1, accordion)
  }
  const collapsed = new Set([...foldable].filter(([, folded]) => folded).map(([line]) => line))
  const tasks = new Map(
    resolvedTasks(text, view.state.facet(taskNotes)).map((task) => [task.line, task]),
  )
  const progress = sectionProgress(
    text,
    [...tasks.values()],
    collapsed,
    view.state.facet(taskNotes),
  )
  const checklists = sectionChecklists(text, [...tasks.values()])
  const definitions = []
  walk(tree, (node) => {
    if (node.type === 'definition' || node.type === 'footnoteDefinition')
      definitions.push(doc.sliceString(node.position.start.offset, node.position.end.offset))
  })
  const definitionText = definitions.join('\n')
  const coverOffset = noteCover(text, tree)?.position.start.offset
  const imageByLine = new Map(
    imageReferences(text).map((image) => [
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
  const codeAtFence = new Map()
  const setextPairs = new Map()
  const calloutLines = new Map()
  walk(tree, (node) => {
    const callout = readCallout(text, node)
    if (callout)
      for (let line = callout.first; line <= callout.last; line++) calloutLines.set(line, callout)
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
      if (opening) codeAtFence.set(first, { first, last })
      if (closing) codeAtFence.set(last, { first, last })
    }
    if (node.type === 'heading' && node.position.end.line > node.position.start.line) {
      const first = node.position.start.line
      const last = node.position.end.line
      blockShapes.set(first, { kind: 'h' + node.depth, prefix: 0 })
      blockShapes.set(last, { kind: 'setext-marker', prefix: doc.line(last).length })
      setextPairs.set(first, last)
      setextPairs.set(last, first)
    }
  })
  const result = {
    doc,
    notes,
    folds,
    text,
    foldable,
    accordionLines,
    tasks,
    progress,
    checklists,
    definitionText,
    imageByLine,
    coverOffset,
    breakMarks,
    listDepths,
    continuations,
    blockShapes,
    fenceStarts,
    fenceEnds,
    codeBlocks,
    codeRangesByLine,
    codeAtFence,
    setextPairs,
    calloutLines,
  }
  markdownByView.set(view, result)
  return result
}

export function decorationsFor(view) {
  const doc = view.state.doc,
    ranges = []
  const editing = new Set(),
    selectedLines = []
  // Read-only preview never reveals Markdown syntax, so the layout matches an idle editor. Each
  // column keeps a cursor of its own: only the column being edited shows the syntax.
  const idle = view.state.readOnly || (view.state.facet(embeddedDocument) && !view.hasFocus)
  for (const selection of idle ? [] : view.state.selection.ranges) {
    const first = doc.lineAt(selection.from).number,
      last = doc.lineAt(selection.to).number
    selectedLines.push({ first, last })
    for (let number = first; number <= last; number++) editing.add(number)
  }
  const placeholderLine = emptyBodyLine(view.state)
  const gapLines = view.state.field(blockGaps, false)?.lines ?? new Set()
  // A column has no title line.
  const titleLine = view.state.facet(embeddedDocument) ? 0 : titleLineNumber(doc)
  const {
    text,
    foldable,
    accordionLines,
    tasks,
    progress,
    checklists,
    definitionText,
    imageByLine,
    coverOffset,
    breakMarks,
    listDepths,
    continuations,
    blockShapes,
    fenceStarts,
    fenceEnds,
    codeBlocks,
    codeRangesByLine,
    codeAtFence,
    setextPairs,
    calloutLines,
  } = documentDecorations(view)
  const noteInfo = view.state
    .facet(taskNotes)
    .find((note) => note.id === view.state.facet(activeNoteId))
  const variableContext = () => ({
    body: text,
    modifiedAt: noteInfo?.modifiedAt,
    createdAt: noteInfo?.createdAt,
    language: currentLanguage(),
  })
  for (const visible of view.visibleRanges) {
    const first = doc.lineAt(visible.from).number,
      last = doc.lineAt(visible.to).number
    for (let number = first; number <= last; number++) {
      const source = doc.line(number)
      // `length` is a getter of CodeMirror's Line: the spread does not copy it.
      const line = { ...source, length: source.length, definitions: definitionText },
        shape = blockShapes.get(number) ?? classifyLine(line.text, false)
      if (number < titleLine) {
        // The YAML block (properties) is shown as plain text, never as Markdown.
        const edge = number === 1 ? ' cm-md-frontmatter-first' : ''
        const end = number === titleLine - 1 ? ' cm-md-frontmatter-last' : ''
        // A readable block is shown by the properties panel; an unreadable one stays as text.
        const hidden =
          view.state.facet(hideFrontmatter) &&
          frontmatterReadable(doc.sliceString(0, doc.line(titleLine - 1).to))
            ? ' cm-md-frontmatter-hidden'
            : ''
        ranges.push(
          Decoration.line({
            attributes: { class: `cm-md-frontmatter${edge}${end}${hidden}` },
          }).range(line.from),
        )
        continue
      }
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
      if (line.text.startsWith('<!--') && isTableFlagsLine(doc, number)) {
        ranges.push(Decoration.line({ attributes: { class: 'cm-md-table-meta' } }).range(line.from))
        if (line.length) ranges.push(Decoration.replace({}).range(line.from, line.to))
        continue
      }
      const table = shape.kind === 'table' ? tableAt(doc, number) : null
      if (table) {
        tableDecorations(ranges, view, line, number, table)
        continue
      }
      // The separating empty line is drawn by blockGaps as the gap between blocks.
      if (gapLines.has(number)) continue
      const fence = codeAtFence.get(number)
      const active =
        editing.has(number) ||
        editing.has(setextPairs.get(number)) ||
        (fence &&
          selectedLines.some(({ first, last }) => first <= fence.last && last >= fence.first))
      const callout = calloutLines.get(number)
      const calloutClass = callout
        ? `cm-md-callout${number === callout.first ? ' callout-title' : ''}${number === callout.last ? ' cm-md-callout-last' : ''}`
        : ''
      if (callout?.first === number) {
        ranges.push(
          Decoration.line({
            attributes: { class: calloutClass, 'data-callout': callout.type },
          }).range(line.from),
        )
        if (!active) {
          const widget = callout.title
            ? undefined
            : new CalloutTitleWidget(t(`callout.${callout.type}`))
          ranges.push(
            Decoration.replace({ widget }).range(
              line.from,
              callout.title ? line.from + callout.prefix : line.to,
            ),
          )
        }
        continue
      }
      const accordion = accordionLines.get(number)
      if (accordion) {
        if (number === accordion.titleEnd) {
          const folded = isFolded(view.state, line.to)
          ranges.push(
            Decoration.line({ attributes: { class: 'cm-md-accordion-title' } }).range(line.from),
            Decoration.widget({
              widget: new FoldToggleWidget(accordion.line, folded, true),
              side: -2,
            }).range(line.from),
          )
          addInlineDecorations(ranges, line, { prefix: 0 }, active)
        } else if (!active) {
          ranges.push(
            Decoration.line({ attributes: { class: 'cm-md-accordion-meta' } }).range(line.from),
          )
          if (line.length) ranges.push(Decoration.replace({}).range(line.from, line.to))
        }
        continue
      }
      const task = TASK_PREFIX.exec(line.text)
      if (task) {
        ranges.push(
          Decoration.line({
            attributes: {
              class: `cm-md-paragraph cm-md-task${active ? ' cm-md-editing' : ''}`,
              ...(listDepths.get(number) ? { style: listMargin(listDepths.get(number)) } : {}),
            },
          }).range(line.from),
        )
        const markerEnd = line.from + task[0].length
        const showMarker =
          active &&
          view.state.selection.ranges.some(
            (selection) => selection.from < markerEnd && selection.to >= line.from,
          )
        if (showMarker) {
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
                view.state.facet(staticDocument) || Boolean(tasks.get(number)?.progress),
                tasks.get(number)?.status,
                tasks.get(number)?.archived,
              ),
            }).range(line.from, line.from + task[0].length),
          )
        const { main, ranges: selections } = view.state.selection
        if (
          platform === 'desktop' &&
          active &&
          selections.length === 1 &&
          main.empty &&
          tasks.has(number) &&
          [-1, 1].some(
            (direction) => moveListItems(text, line.from, line.from, direction)?.changes.length,
          )
        ) {
          ranges.push(Decoration.widget({ widget: new TaskMoveHint(), side: 1 }).range(line.to))
        }
        const stamps = active ? [] : taskDates(line.text)
        for (const stamp of stamps)
          ranges.push(
            Decoration.replace({ widget: new TaskDateWidget(stamp) }).range(
              line.from + stamp.index,
              line.from + stamp.index + stamp.length,
            ),
          )
        const linked = tasks.get(number)?.progress
        if (linked)
          ranges.push(
            Decoration.widget({
              widget: new ProgressWidget(linked),
              side: 1,
            }).range(line.to),
          )
        addInlineDecorations(ranges, line, { prefix: task[0].length }, active)
        continue
      }
      // The note pane shows the cover above the note: its line takes no space and no caret.
      if (coverOffset === line.from && view.state.facet(hideFrontmatter)) {
        ranges.push(
          Decoration.line({ attributes: { class: 'cm-md-frontmatter-hidden' } }).range(line.from),
        )
        continue
      }
      const image = imageByLine.get(number)
      if (
        image &&
        (image.occurrence ?? image.node).position.start.offset === line.from &&
        (image.occurrence ?? image.node).position.end.offset === line.to &&
        (!active || coverOffset === line.from)
      ) {
        ranges.push(
          Decoration.replace({
            widget: new ImageWidget(image.src, image.name, image.title, coverOffset === line.from),
          }).range(line.from, line.to),
        )
        continue
      }
      if (!active && breakMarks.has(number))
        ranges.push(
          Decoration.replace({}).range(breakMarks.get(number), breakMarks.get(number) + 1),
        )
      if (foldable.has(number)) {
        ranges.push(
          Decoration.widget({
            widget: new FoldToggleWidget(number, foldable.get(number)),
            side: -2,
          }).range(line.from),
        )
      }
      const indent = line.text.match(/^\s*/)[0].length
      // The margin carries the nesting, so the source spaces never show.
      if (shape.kind === 'ordered' && indent && listDepths.has(number))
        ranges.push(Decoration.replace({}).range(line.from, line.from + indent))
      const attrs = lineAttributes(line, shape, active, listDepths.get(number))
      if (callout) {
        attrs.class += ` ${calloutClass}`
        attrs['data-callout'] = callout.type
      }
      // The file's final line break is not an empty paragraph until the cursor goes there.
      if (
        shape.kind === 'paragraph' &&
        number === doc.lines &&
        number > Math.max(titleLine, placeholderLine ?? 0) + 1 &&
        !line.text.trim() &&
        !active
      )
        attrs.class += ' cm-md-trailing'
      if (number === titleLine && line.text === '# ') {
        attrs.class += ' cm-empty-title'
        attrs['data-placeholder'] = t('editor.titleHint')
      }
      if (number === placeholderLine && !line.text) {
        attrs.class += ' cm-empty-body'
        attrs['data-placeholder'] = t('editor.previewHint')
      } else if (number === titleLine && doc.lines === titleLine) {
        attrs.class += ' cm-empty-body-host'
        ranges.push(
          Decoration.widget({
            widget: new EmptyBodyWidget(t('editor.previewHint')),
            side: 1,
          }).range(line.to),
        )
      }
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
      const checklist = !view.state.facet(staticDocument) && checklists.get(number)
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
        if (number === titleLine)
          ranges.push(Decoration.replace({}).range(line.from, line.from + 2))
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
      if (number !== titleLine && line.text.includes('{{')) {
        for (const variable of lineVariables(line.text)) {
          const raw = line.text.slice(variable.from, variable.to)
          const result = resolveVariable(variable.name, variable.argument, variableContext())
          const from = line.from + variable.from,
            to = line.from + variable.to
          if (result.error)
            ranges.push(
              Decoration.mark({
                class: 'cm-variable cm-variable-error',
                attributes: { title: result.error },
              }).range(from, to),
            )
          else
            ranges.push(
              Decoration.replace({ widget: new VariableWidget(result.text, raw) }).range(from, to),
            )
        }
      }
      const section = progress.get(number)
      if (section)
        ranges.push(
          Decoration.widget({
            widget: new ProgressWidget(section),
            side: -1,
          }).range(line.to),
        )
    }
  }
  const cells = ranges.filter((range) =>
    range.value.spec.attributes?.class?.split(' ').includes('cm-md-table-cell'),
  )
  const cellSet = new Set(cells)
  return {
    decorations: Decoration.set(
      ranges.filter((range) => !cellSet.has(range)),
      true,
    ),
    cells: Decoration.set(cells, true),
  }
}

export const liveMarkdown = ViewPlugin.fromClass(
  class {
    constructor(view) {
      Object.assign(this, decorationsFor(view))
    }
    update(update) {
      if (
        update.startState.facet(taskNotes) !== update.state.facet(taskNotes) ||
        update.docChanged ||
        (update.focusChanged && update.state.facet(embeddedDocument)) ||
        update.startState.readOnly !== update.state.readOnly ||
        (update.selectionSet &&
          selectionLineSignature(update.startState) !== selectionLineSignature(update.state)) ||
        update.viewportChanged ||
        update.startState.field(sheetField, false) !== update.state.field(sheetField, false) ||
        update.startState.field(foldField) !== update.state.field(foldField) ||
        update.startState.field(tableUiField, false) !== update.state.field(tableUiField, false)
      )
        Object.assign(this, decorationsFor(update.view))
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) => [
      EditorView.outerDecorations.of((view) => view.plugin(plugin)?.cells ?? Decoration.none),
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.gaps ?? Decoration.none),
    ],
  },
)
