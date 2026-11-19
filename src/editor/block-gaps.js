import { StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { markdownTree, walk } from '../markdown-model.js'
import { titleLineNumber } from '../frontmatter.js'

const blank = (doc, number) => !doc.line(number).text.trim()

/**
 * An empty line that only separates two blocks: the first of a run of empty lines, and also the
 * last one when the run has three or more lines. The other empty lines are empty paragraphs.
 */
export function isGapLine(doc, number, firstBodyLine) {
  if (number <= firstBodyLine || number >= doc.lines || !blank(doc, number)) return false
  if (!blank(doc, number - 1)) return true
  if (blank(doc, number + 1)) return false
  let start = number
  while (start > 1 && blank(doc, start - 1)) start--
  return number - start + 1 >= 3 && start > 1
}

/** Gap lines outside code, keyed by line number. */
export function gapLines(doc, boxes) {
  const text = doc.toString()
  const code = []
  walk(markdownTree(text), (node) => {
    if (node.type === 'code') code.push([node.position.start.line, node.position.end.line])
  })
  const inCode = (number) => code.some(([from, to]) => number >= from && number <= to)
  const first = titleLineNumber(doc) + 1
  if (boxes) {
    for (const [from, to] of code) {
      boxes.starts.add(from)
      boxes.ends.add(to)
    }
    for (let number = 1; number <= doc.lines; number++) {
      if (!/^\s*\|/.test(doc.line(number).text) || inCode(number)) continue
      if (number === 1 || !/^\s*\|/.test(doc.line(number - 1).text)) boxes.starts.add(number)
      if (number === doc.lines || !/^\s*\|/.test(doc.line(number + 1).text)) boxes.ends.add(number)
    }
  }
  const gaps = new Set()
  for (let number = first + 1; number < doc.lines; number++)
    if (isGapLine(doc, number, first) && !inCode(number)) gaps.add(number)
  return gaps
}

/** The standard gap between two blocks: not a line, so it takes no cursor and no click. */
class GapWidget extends WidgetType {
  constructor(next) {
    super()
    this.next = next
  }
  eq(other) {
    return other.next === this.next
  }
  get estimatedHeight() {
    return 22
  }
  toDOM(view) {
    const gap = document.createElement('div')
    gap.className = 'cm-block-gap'
    gap.setAttribute('aria-hidden', 'true')
    // A click on the gap goes to the start of the block below it.
    gap.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const line = view.state.doc.line(Math.min(this.next, view.state.doc.lines))
      view.dispatch({ selection: { anchor: line.from } })
      view.focus()
    })
    return gap
  }
  ignoreEvent() {
    return true
  }
}

/**
 * The editor shows no empty line between two blocks: the separating line (kept in the Markdown)
 * is drawn as the standard gap, and the cursor skips it.
 */
function build(doc) {
  const boxes = { starts: new Set(), ends: new Set() }
  const lines = gapLines(doc, boxes)
  const hidden = [],
    atomic = []
  // Two code blocks or tables written with no empty line between them still get the gap.
  for (const number of boxes.ends)
    if (boxes.starts.has(number + 1))
      hidden.push(
        Decoration.widget({ widget: new GapWidget(number + 1), block: true, side: 1 }).range(
          doc.line(number).to,
        ),
      )
  for (const number of lines) {
    const gap = doc.line(number)
    atomic.push(Decoration.mark({}).range(doc.line(number - 1).to, doc.line(number + 1).from))
    hidden.push(
      Decoration.replace({ widget: new GapWidget(number + 1), block: true }).range(
        gap.from,
        gap.to,
      ),
    )
  }
  return { lines, hidden: Decoration.set(hidden, true), atomic: Decoration.set(atomic) }
}

export const blockGaps = StateField.define({
  create: (state) => build(state.doc),
  update: (value, transaction) => (transaction.docChanged ? build(transaction.state.doc) : value),
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.hidden),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
  ],
})
