import { createNoteDocument, renameNoteDocument, updateNoteBody } from '../document-mutations.js'

export function newMobileNote(document, title = '', id = crypto.randomUUID(), body = null) {
  return createNoteDocument(document, { id, title, body, prepend: true }).document
}

export function updateMobileNote(document, id, body) {
  return updateNoteBody(document, id, body)
}

export function renameMobileNote(document, id, proposed) {
  return renameNoteDocument(document, id, proposed, { strict: true })
}
