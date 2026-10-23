import { EditorSelection } from '@codemirror/state'
import { wrapSelection } from '../wrap-selection.js'
import { continueBlock } from '../continue-block.js'
import { listIndentChanges } from '../list-indent.js'
import { moveListItems } from '../list-move.js'
import { moveSectionBy } from '../section-move.js'
import { foldRange, isFolded, refoldAfterMove } from './folding.js'
import { headingSections } from '../sections.js'

export function wrapSelectedText(event, view) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false
  const ranges = view.state.selection.ranges
  if (!ranges.some((range) => !range.empty)) return false
  const changes = [],
    selections = []
  for (const range of ranges) {
    const wrapped = wrapSelection(
      view.state.doc.sliceString(range.from, range.to),
      0,
      range.to - range.from,
      event.key,
    )
    if (!wrapped) return false
    changes.push({ from: range.from, to: range.to, insert: wrapped.insert })
  }
  let offset = 0
  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index],
      insert = changes[index].insert
    selections.push(
      EditorSelection.range(range.from + offset + 1, range.from + offset + insert.length - 1),
    )
    offset += insert.length - (range.to - range.from)
  }
  view.dispatch({
    changes,
    selection: EditorSelection.create(selections, view.state.selection.mainIndex),
    userEvent: 'lista',
  })
  event.preventDefault()
  return true
}

export function continueList(view) {
  if (view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty) return false
  const continued = continueBlock(view.state.doc.toString(), view.state.selection.main.head)
  if (!continued) return false
  view.dispatch({
    changes: { from: continued.from, to: continued.to, insert: continued.insert },
    selection: { anchor: continued.cursor },
    userEvent: 'lista',
  })
  return true
}

export function navigateToFence(view, direction) {
  if (view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty) return false
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const next = line.number + direction
  if (next < 1 || next > view.state.doc.lines) return false
  const target = view.state.doc.line(next)
  if (!target.text.startsWith('```')) return false
  view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true })
  return true
}

/** Tab / Shift+Tab on list items. Swallows the key on a list so focus stays in the editor. */
export function indentList(view, outdent = false) {
  const { from, to } = view.state.selection.main
  if (view.state.selection.ranges.length !== 1) return false
  const changes = listIndentChanges(view.state.doc.toString(), from, to, outdent)
  if (!changes) return false
  if (changes.length) view.dispatch({ changes, userEvent: 'lista' })
  return true
}

/** Keep the cursor/selection on the item as its entire subtree moves. */
export function moveList(view, direction) {
  if (view.state.selection.ranges.length !== 1) return false
  const { anchor, head } = view.state.selection.main
  // A single-line caret/selection on a heading moves the whole section instead.
  const first = view.state.doc.lineAt(anchor)
  if (first.number === view.state.doc.lineAt(head).number) {
    const movedHeading = moveSectionBy(view.state.doc.toString(), first.number, direction)
    if (movedHeading) {
      if (movedHeading.changes.length) {
        // The fold belongs to the section; it travels with the move.
        const section = headingSections(view.state.doc.toString()).find(
          (heading) => heading.line === first.number,
        )
        const range = section && foldRange(view.state, section)
        const folded = range && isFolded(view.state, range.from)
        view.dispatch({
          changes: movedHeading.changes,
          selection: EditorSelection.single(movedHeading.anchor, movedHeading.head),
          scrollIntoView: true,
          userEvent: 'secao',
        })
        if (folded) refoldAfterMove(view, movedHeading.anchor)
      }
      return true
    }
  }
  const moved = moveListItems(view.state.doc.toString(), anchor, head, direction)
  if (!moved) return false
  if (moved.changes.length)
    view.dispatch({
      changes: moved.changes,
      selection: EditorSelection.single(moved.anchor, moved.head),
      scrollIntoView: true,
      userEvent: 'lista',
    })
  return true
}
