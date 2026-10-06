import { EditorState, EditorSelection } from '@codemirror/state'

export function ensureTitle(body, fallback = '') {
  const end = body.indexOf('\n')
  const first = end < 0 ? body : body.slice(0, end)
  const title = first.replace(/^(?:[ \t]*#+[ \t]*)+|^[ \t]+/, '')
  return `# ${title.trim() ? title : fallback.trim()}${end < 0 ? '' : body.slice(end)}`
}
// Preserve cursor positions when correcting the title prefix.
export function titlePosition(body, normalized, position) {
  const oldEnd = body.indexOf('\n') < 0 ? body.length : body.indexOf('\n')
  const newEnd = normalized.indexOf('\n') < 0 ? normalized.length : normalized.indexOf('\n')
  return position <= oldEnd
    ? Math.max(2, Math.min(newEnd, position + newEnd - oldEnd))
    : position + normalized.length - body.length
}
export function titleNavigationTarget(body, position, backwards = false) {
  const end = body.indexOf('\n') < 0 ? body.length : body.indexOf('\n')
  if (backwards) return position > end ? end : null
  return position <= end ? end + 1 : null
}
export function navigateTitle(view, backwards = false) {
  const body = view.state.doc.toString()
  const target = titleNavigationTarget(body, view.state.selection.main.head, backwards)
  if (target === null) return false
  view.dispatch({
    ...(target > body.length ? { changes: { from: body.length, insert: '\n' } } : {}),
    selection: EditorSelection.single(target),
    scrollIntoView: true,
  })
  return true
}
export function ensureDocumentTitles(document) {
  const notes = document.notes.map((note) => {
    const body = ensureTitle(note.body)
    return body === note.body ? note : { ...note, body, revision: note.revision + 1 }
  })
  return notes.some((note, index) => note !== document.notes[index])
    ? { ...document, notes }
    : document
}
const clamp = (selection, map = (position) => position) =>
  EditorSelection.create(
    selection.ranges.map((range) =>
      EditorSelection.range(Math.max(2, map(range.anchor)), Math.max(2, map(range.head))),
    ),
    selection.mainIndex,
  )
// Keep the Markdown prefix outside every selection, including Select All.
export const mandatoryTitle = EditorState.transactionFilter.of((transaction) => {
  const body = transaction.newDoc.toString()
  const normalized = ensureTitle(body)
  const selection = transaction.newSelection
  if (normalized === body) {
    if (selection.ranges.some((range) => range.from < 2))
      return [transaction, { selection: clamp(selection), sequential: true }]
    return transaction
  }
  const line = transaction.newDoc.line(1)
  const first = normalized.split('\n')[0]
  return [
    transaction,
    {
      changes: { from: 0, to: line.to, insert: first },
      selection: clamp(selection, (position) => titlePosition(body, normalized, position)),
      sequential: true,
    },
  ]
})
