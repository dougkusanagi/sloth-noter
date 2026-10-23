import { ensureTitle } from '../title.js'
import { nameFromHeading, uniqueName } from '../notes.js'
import { renameWikiReferences } from '../markdown-model.js'

export function newMobileNote(document, title = '', id = crypto.randomUUID()) {
  const body = ensureTitle('', title)
  const note = {
    id,
    name: uniqueName(document.notes, nameFromHeading(body, [], id) ?? 'new note.md'),
    body,
    revision: 0,
  }
  return {
    ...document,
    notes: [note, ...document.notes],
    openIds: [...document.openIds, id],
    activeId: id,
  }
}

export function updateMobileNote(document, id, body) {
  const previous = document.notes.find((note) => note.id === id)
  if (!previous) return document
  if (!previous.external) body = ensureTitle(body)
  if (previous.body === body) return document
  const name = previous.external
    ? previous.name
    : (nameFromHeading(body, document.notes, id) ?? previous.name)
  const rewrite = (note) => {
    let text = note.id === id ? body : note.body
    if (name !== previous.name) text = renameWikiReferences(text, previous.name, name)
    return text === note.body && (note.id !== id || name === note.name)
      ? note
      : {
          ...note,
          body: text,
          name: note.id === id ? name : note.name,
          revision: note.revision + 1,
        }
  }
  return {
    ...document,
    notes: document.notes.map(rewrite),
    trash: document.trash.map((entry) => ({ ...entry, note: rewrite(entry.note) })),
  }
}
