import { ChangeSet, EditorState, EditorSelection } from '@codemirror/state'

export function ensureTitle(body, fallback = '') {
  const end = body.indexOf('\n')
  const first = end < 0 ? body : body.slice(0, end)
  const title = first.replace(/^(?:[ \t]*#+[ \t]*)+|^[ \t]+/, '')
  return `# ${title.trim() ? title : fallback.trim()}${end < 0 ? '' : body.slice(end)}`
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
  const changes = ChangeSet.of(
    { from: 0, to: line.to, insert: normalized.split('\n')[0] },
    body.length,
  )
  const delta = normalized.length - body.length
  return [
    transaction,
    {
      changes,
      selection: clamp(selection, (position) =>
        position <= line.to
          ? Math.min(normalized.split('\n')[0].length, position + delta)
          : changes.mapPos(position),
      ),
      sequential: true,
    },
  ]
})
