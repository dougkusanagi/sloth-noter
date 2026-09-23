export const STORAGE_KEY = 'sloth-note:v1'
export const starterNotes = [{ id: 'welcome', name: 'welcome.md', body: '# Welcome\n\nA quiet place to write. Notes are saved in this browser as you type. Export a Markdown file to keep a separate copy.', revision: 0 }]
export function validateDocument(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.notes) || !value.notes.length) throw new Error('Stored notes have an invalid format')
  const ids = new Set()
  for (const note of value.notes) {
    if (!note || typeof note.id !== 'string' || !note.id || ids.has(note.id) || typeof note.name !== 'string' || typeof note.body !== 'string' || !Number.isSafeInteger(note.revision) || note.revision < 0) throw new Error('Stored notes have an invalid format')
    ids.add(note.id)
  }
  if (typeof value.activeId !== 'string' || !ids.has(value.activeId)) throw new Error('Stored active note is invalid')
  return value
}
export function loadDocument(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) {
      const document = { version: 1, notes: starterNotes.map(note => ({ ...note })), activeId: 'welcome' }
      storage.setItem(STORAGE_KEY, JSON.stringify(document))
      return { document, error: null }
    }
    return { document: validateDocument(JSON.parse(raw)), error: null }
  } catch (error) {
    return { document: { version: 1, notes: starterNotes.map(note => ({ ...note })), activeId: 'welcome' }, error: error instanceof Error ? error.message : 'Storage is unavailable' }
  }
}
export function saveDocument(storage, document) {
  try {
    validateDocument(document)
    storage.setItem(STORAGE_KEY, JSON.stringify(document))
    return null
  } catch (error) { return error instanceof Error ? error.message : 'Storage is unavailable' }
}
