import { markdownTree, walk } from '../markdown-model.js'
import { parseTableLine } from '../markdown-table.js'
import { tableContextAt } from '../editor/table.js'

export function codeAt(state) {
  let found = null
  const head = state.selection.main.head
  walk(markdownTree(state.doc.toString()), (node) => {
    if (
      node.type === 'code' &&
      head >= node.position.start.offset &&
      head <= node.position.end.offset
    )
      found = node
  })
  return found
}

export function alignTableColumn(view, alignment) {
  const context = tableContextAt(view)
  if (!context || view.composing || view.compositionStarted) return false
  const line = view.state.doc.line(context.table.first + 1)
  const cell = parseTableLine(line.text)?.cells[context.column]
  if (!cell) return false
  view.dispatch({
    changes: {
      from: line.from + cell.from,
      to: line.from + cell.to,
      insert: { left: ':---', center: ':---:', right: '---:' }[alignment],
    },
    userEvent: 'formatacao',
  })
  return true
}
