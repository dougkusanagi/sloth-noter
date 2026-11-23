import { accordionBlocks } from '../accordion.js'
import { EditorSelection, EditorState, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { markdownTree, walk } from '../markdown-model.js'
import { titleLineNumber } from '../frontmatter.js'

// The empty line holding the cursor is text being written (a Shift+Enter line break, for example),
// never a gap; it counts as a line with text.
const blank = (doc, number, cursorLine) => number !== cursorLine && !doc.line(number).text.trim()

/**
 * An empty line that only separates two blocks: the first of a run of empty lines, and also the
 * last one when the run has three or more lines. The other empty lines are empty paragraphs.
 */
export function isGapLine(doc, number, firstBodyLine, cursorLine = 0) {
  if (number <= firstBodyLine || number >= doc.lines || !blank(doc, number, cursorLine))
    return false
  if (!blank(doc, number - 1, cursorLine)) return true
  if (blank(doc, number + 1, cursorLine)) return false
  let start = number
  while (start > 1 && blank(doc, start - 1, cursorLine)) start--
  return number - start + 1 >= 3 && start > 1
}

/** Gap lines outside code, keyed by line number. */
export function gapLines(doc, boxes, cursorLine = 0) {
  const text = doc.toString()
  const tree = markdownTree(text)
  const accordionPadding = new Set(accordionBlocks(text, tree).map((block) => block.end - 1))
  const code = []
  walk(tree, (node) => {
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
    // A heading touching another block with no empty line is still a separate block in
    // Markdown, so it gets the same gap; the spacing must not depend on that blank line.
    for (let index = 1; index < tree.children.length; index++) {
      const above = tree.children[index - 1].position
      const below = tree.children[index].position
      if (!above || !below || above.end.line <= first || below.start.line !== above.end.line + 1)
        continue
      const types = [tree.children[index - 1].type, tree.children[index].type]
      // A rule is already a boundary; right under a heading it underlines it.
      if (types.includes('heading') && !types.includes('thematicBreak'))
        boxes.joins.add(above.end.line)
    }
  }
  const gaps = new Set()
  for (let number = first + 1; number < doc.lines; number++)
    if (
      !accordionPadding.has(number) &&
      isGapLine(doc, number, first, cursorLine) &&
      !inCode(number)
    )
      gaps.add(number)
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
      event.stopPropagation()
      const line = view.state.doc.line(Math.min(this.next, view.state.doc.lines))
      view.focus()
      view.dispatch({ selection: { anchor: line.from }, userEvent: 'select.pointer' })
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
function build(state, cursorLine) {
  const doc = state.doc
  const boxes = { starts: new Set(), ends: new Set(), joins: new Set() }
  const lines = gapLines(doc, boxes, cursorLine)
  const hidden = [],
    atomic = []
  // Two code blocks or tables, or a heading and another block, written with no empty line
  // between them still get the gap.
  for (const number of new Set([...boxes.joins, ...boxes.ends]))
    if (boxes.joins.has(number) || boxes.starts.has(number + 1))
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

const cursorLineOf = (state) => state.doc.lineAt(state.selection.main.head).number

export const blockGaps = StateField.define({
  // `writing` is the line just edited while the cursor stays on it; moving away releases it, so the
  // arrow keys still skip gaps.
  create: (state) => ({ ...build(state, 0), writing: 0 }),
  update: (value, transaction) => {
    const line = cursorLineOf(transaction.state)
    if (transaction.docChanged) return { ...build(transaction.state, line), writing: line }
    if (value.writing && value.writing !== line)
      return { ...build(transaction.state, 0), writing: 0 }
    return value
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.hidden),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
    // Atomic ranges only steer CodeMirror's own commands. A selection that comes from the
    // browser (WebKit moves it natively with the arrow keys) can still land inside the gap, so
    // push it to the block on the side it was moving to.
    EditorState.transactionFilter.of((transaction) => {
      if (!transaction.selection) return transaction
      const { atomic } = transaction.state.field(field)
      const previous = transaction.startState.selection.main.head
      let moved = false
      const ranges = transaction.selection.ranges.map((range) => {
        let head = range.head
        atomic.between(head, head, (from, to) => {
          if (head <= from || head >= to) return
          head = head >= previous ? to : from
          moved = true
          return false
        })
        return range.empty ? EditorSelection.cursor(head) : range
      })
      if (!moved) return transaction
      return [
        transaction,
        {
          selection: EditorSelection.create(ranges, transaction.selection.mainIndex),
          // The positions are in the changed document.
          sequential: true,
        },
      ]
    }),
  ],
})
