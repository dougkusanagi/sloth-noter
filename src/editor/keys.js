import { EditorSelection } from '@codemirror/state'
import { wrapSelection } from '../wrap-selection.js'
import { continueBlock } from '../continue-block.js'

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
    userEvent: 'input.type',
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
    userEvent: 'input.type',
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
