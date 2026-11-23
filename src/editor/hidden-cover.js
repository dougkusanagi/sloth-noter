import { EditorSelection, EditorState, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { titleLineNumber } from '../frontmatter.js'
import { noteCover } from '../note-cover.js'
import { hideFrontmatter } from './hide-frontmatter.js'

/**
 * The cover line, when the note pane shows the cover above the note (it stays in the Markdown,
 * right after the title). `from` is the end of the title; `to` is where the body starts.
 */
export function hiddenCoverRange(doc) {
  const title = titleLineNumber(doc)
  let number = title + 1
  while (number <= doc.lines && !doc.line(number).text.trim()) number++
  if (number > doc.lines) return null
  const line = doc.line(number)
  if (!line.text.includes('sloth:cover')) return null
  const cover = noteCover(doc.sliceString(0, line.to))
  if (!cover || cover.position.start.offset !== line.from) return null
  return {
    line: number,
    from: doc.line(title).to,
    to: number < doc.lines ? doc.line(number + 1).from : line.to,
  }
}

const compute = (state) => (state.facet(hideFrontmatter) ? hiddenCoverRange(state.doc) : null)

const field = StateField.define({
  create: compute,
  update: (value, transaction) =>
    transaction.docChanged ||
    transaction.startState.facet(hideFrontmatter) !== transaction.state.facet(hideFrontmatter)
      ? compute(transaction.state)
      : value,
  provide: (self) =>
    EditorView.atomicRanges.of((view) => {
      const range = view.state.field(self)
      return range && range.to > range.from
        ? Decoration.set(Decoration.mark({}).range(range.from, range.to))
        : Decoration.none
    }),
})

/** Keeps the caret out of the hidden cover line, including native (browser) moves. */
export const hiddenCover = [
  field,
  EditorState.transactionFilter.of((transaction) => {
    if (!transaction.selection) return transaction
    const range = transaction.state.field(field)
    if (!range) return transaction
    const previous = transaction.startState.selection.main.head
    let moved = false
    const inside = (position) => position > range.from && position < range.to
    const ranges = transaction.selection.ranges.map((selection) => {
      if (!inside(selection.head) && !inside(selection.anchor)) return selection
      moved = true
      const push = (position) =>
        inside(position) ? (position >= previous ? range.to : range.from) : position
      return EditorSelection.range(push(selection.anchor), push(selection.head))
    })
    if (!moved) return transaction
    return [
      transaction,
      {
        selection: EditorSelection.create(ranges, transaction.selection.mainIndex),
        sequential: true,
      },
    ]
  }),
]
