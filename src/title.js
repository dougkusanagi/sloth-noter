import { EditorState, EditorSelection } from '@codemirror/state'
import { frontmatterEnd, readProperties, titleEnd } from './frontmatter.js'
import { hideFrontmatter } from './editor/hide-frontmatter.js'

/**
 * `---` written on the title line starts a YAML block, not a title. Without this, the title's `# `
 * turned the opening fence into `# ---` and the properties showed as headings. A note already
 * saved that way is repaired when the lines up to the next fence are readable properties.
 */
function openPropertiesFromTitle(body) {
  if (frontmatterEnd(body)) return body
  const fence = /^[ \t]*#*[ \t]*---[ \t]*(?=\n|$)/.exec(body)
  if (!fence) return body
  const rest = body.slice(fence[0].length)
  const candidate = `---${rest}`
  const end = frontmatterEnd(candidate)
  if (end) {
    const read = readProperties(candidate.slice(0, end))
    return read.ok && read.entries.length ? candidate : body
  }
  // Unclosed: only a title that is just `---` (nothing right below it) becomes a new empty block.
  if (rest && !/^\n[ \t]*(?:\n|$)/.test(rest)) return body
  return `---\n\n---\n${rest.replace(/^\n/, '')}`
}

/** True when the edit turned a `---` title into the opening of a YAML block. */
export function startsProperties(body) {
  return openPropertiesFromTitle(body) !== body
}

// The YAML block (frontmatter), when there is one, comes first; the title is the line after it.
export function ensureTitle(body, fallback = '') {
  body = openPropertiesFromTitle(body)
  const start = frontmatterEnd(body)
  const text = body.slice(start)
  const end = text.indexOf('\n')
  const first = end < 0 ? text : text.slice(0, end)
  const title = first.replace(/^(?:[ \t]*#+[ \t]*)+|^[ \t]+/, '')
  return `${body.slice(0, start)}# ${title.trim() ? title : fallback.trim()}${end < 0 ? '' : text.slice(end)}`
}
// Preserve cursor positions when correcting the title prefix.
export function titlePosition(body, normalized, position) {
  const start = frontmatterEnd(body)
  const oldEnd = titleEnd(body)
  const newEnd = titleEnd(normalized)
  if (position < start) return position
  return position <= oldEnd
    ? Math.max(start + 2, Math.min(newEnd, position + newEnd - oldEnd))
    : position + normalized.length - body.length
}
export function titleNavigationTarget(body, position, backwards = false) {
  const start = frontmatterEnd(body)
  const end = titleEnd(body)
  if (backwards) return position > end ? end : null
  return position >= start && position <= end ? end + 1 : null
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
    // Files opened in place keep their own text; the app must not rewrite them.
    const body = note.external ? note.body : ensureTitle(note.body)
    return body === note.body ? note : { ...note, body, revision: note.revision + 1 }
  })
  return notes.some((note, index) => note !== document.notes[index])
    ? { ...document, notes }
    : document
}
// Positions inside the YAML block are left alone; the title's `# ` prefix stays out of reach.
const clamp = (selection, start = 0, map = (position) => position) => {
  const keep = (position) => {
    const mapped = map(position)
    return mapped < start ? mapped : Math.max(start + 2, mapped)
  }
  return EditorSelection.create(
    selection.ranges.map((range) => EditorSelection.range(keep(range.anchor), keep(range.head))),
    selection.mainIndex,
  )
}
// Keep the Markdown prefix outside every selection, including Select All.
export const mandatoryTitle = EditorState.transactionFilter.of((transaction) => {
  const body = transaction.newDoc.toString()
  const normalized = ensureTitle(body)
  const start = frontmatterEnd(body)
  if (startsProperties(body)) {
    // The block is new: the whole start of the note changes, and the cursor goes to the title.
    const titleStart = frontmatterEnd(normalized)
    const titleLine = normalized.slice(titleStart).split('\n')[0]
    return [
      transaction,
      {
        changes: { from: 0, to: body.length, insert: normalized },
        selection: EditorSelection.single(titleStart + titleLine.length),
        sequential: true,
      },
    ]
  }
  let selection = transaction.newSelection
  const previous = transaction.startState.selection
  // Some webviews report the replaced range as still selected for the first
  // typed character. Collapse it at the end of the insertion before the next input.
  if (
    transaction.isUserEvent('input.type') &&
    !transaction.isUserEvent('input.type.compose') &&
    !transaction.selection &&
    previous.ranges.length === 1 &&
    !previous.main.empty
  ) {
    let end = null,
      count = 0
    transaction.changes.iterChanges((from, to, _newFrom, newTo, inserted) => {
      count++
      if (from === previous.main.from && to === previous.main.to && inserted.length) end = newTo
    })
    if (count === 1 && end !== null) selection = EditorSelection.single(end)
  }
  if (normalized === body) {
    if (
      selection !== transaction.newSelection ||
      selection.ranges.some((range) => range.from >= start && range.from < start + 2)
    )
      return [transaction, { selection: clamp(selection, start), sequential: true }]
    return transaction
  }
  const line = transaction.newDoc.lineAt(start)
  const first = normalized.slice(start).split('\n')[0]
  return [
    transaction,
    {
      changes: { from: start, to: line.to, insert: first },
      selection: clamp(selection, start, (position) => titlePosition(body, normalized, position)),
      sequential: true,
    },
  ]
})

/**
 * Where the YAML block is hidden (the properties panel shows it), the cursor and selections stay
 * out of it. With a block that cannot be read the lines stay visible and editable.
 */
export const skipHiddenProperties = EditorState.transactionFilter.of((transaction) => {
  const doc = transaction.newDoc
  if (!transaction.state.facet(hideFrontmatter)) return transaction
  if (!/^---[ \t]*$/.test(doc.line(1).text) || !transaction.newSelection) return transaction
  const start = frontmatterEnd(doc.sliceString(0, Math.min(doc.length, 70000)))
  if (!start || transaction.newSelection.ranges.every((range) => range.from >= start))
    return transaction
  if (!readProperties(doc.sliceString(0, start)).ok) return transaction
  const move = (position) => (position < start ? Math.min(start + 2, doc.length) : position)
  return [
    transaction,
    {
      selection: EditorSelection.create(
        transaction.newSelection.ranges.map((range) =>
          EditorSelection.range(move(range.anchor), move(range.head)),
        ),
        transaction.newSelection.mainIndex,
      ),
      sequential: true,
    },
  ]
})
