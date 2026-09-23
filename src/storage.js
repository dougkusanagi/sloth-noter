export const STORAGE_KEY = 'sloth-note:v3'
export const V2_KEY = 'sloth-note:v2'
export const LEGACY_KEY = 'sloth-note:v1'

export function newDocument() {
  return {
    version: 3,
    notes: [{ id: 'welcome', name: 'welcome.md', body: '# Welcome\n\nWrite here. Changes are saved in this browser as you type. Use Export .md for a separate copy.', revision: 0 }],
    trash: [],
    openIds: ['welcome'],
    activeId: 'welcome',
    preferences: { tabsVisible: true, theme: 'system', fontSize: 18 },
  }
}

function validateNote(note, ids) {
  if (!note || typeof note.id !== 'string' || !note.id || ids.has(note.id) || typeof note.name !== 'string' || !note.name || typeof note.body !== 'string' || !Number.isSafeInteger(note.revision) || note.revision < 0) throw new Error('Invalid saved note')
  ids.add(note.id)
}

export function validateDocument(value) {
  if (!value || value.version !== 3 || !Array.isArray(value.notes) || !Array.isArray(value.trash) || !Array.isArray(value.openIds)) throw new Error('Invalid saved notes')
  const ids = new Set()
  for (const note of value.notes) validateNote(note, ids)
  for (const entry of value.trash) {
    if (!entry || !Number.isSafeInteger(entry.index) || entry.index < 0 || !Number.isSafeInteger(entry.deletedAt) || entry.deletedAt < 0) throw new Error('Invalid deleted note')
    validateNote(entry.note, ids)
  }
  const activeIds = new Set(value.notes.map(note => note.id))
  if (new Set(value.openIds).size !== value.openIds.length || value.openIds.some(id => !activeIds.has(id))) throw new Error('Invalid open tabs')
  if (value.activeId !== null && (!activeIds.has(value.activeId) || !value.openIds.includes(value.activeId))) throw new Error('Invalid active note')
  if ((value.openIds.length === 0) !== (value.activeId === null)) throw new Error('Invalid active note')
  const prefs = value.preferences
  if (!prefs || typeof prefs.tabsVisible !== 'boolean' || !['system', 'light', 'dark'].includes(prefs.theme) || !Number.isInteger(prefs.fontSize) || prefs.fontSize < 14 || prefs.fontSize > 24) throw new Error('Invalid preferences')
  return value
}

function migrateV1(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.notes) || value.notes.length === 0) throw new Error('Invalid legacy notes')
  const migrated = { version: 3, notes: value.notes, trash: [], openIds: value.notes.map(note => note.id), activeId: value.activeId, preferences: { tabsVisible: true, theme: 'system', fontSize: 18 } }
  return validateDocument(migrated)
}

function migrateV2(value) {
  if (!value || value.version !== 2) throw new Error('Invalid legacy notes')
  return validateDocument({ ...value, version: 3, trash: [] })
}

function message(error) { return error instanceof Error ? error.message : 'Storage is unavailable' }

export function loadDocument(storage) {
  let raw = null
  let source = null
  try {
    raw = storage.getItem(STORAGE_KEY)
    if (raw !== null) source = 'v3'
    else {
      raw = storage.getItem(V2_KEY)
      if (raw !== null) source = 'v2'
      else {
        raw = storage.getItem(LEGACY_KEY)
        if (raw !== null) source = 'v1'
      }
    }
  } catch (error) {
    return { document: newDocument(), error: message(error), blocked: true, raw: null }
  }
  let document
  try {
    document = source === 'v3' ? validateDocument(JSON.parse(raw)) : source === 'v2' ? migrateV2(JSON.parse(raw)) : source === 'v1' ? migrateV1(JSON.parse(raw)) : newDocument()
  } catch (error) {
    return { document: newDocument(), error: message(error), blocked: true, raw }
  }
  if (source === 'v3') return { document, error: null, blocked: false, raw: null }
  const error = saveDocument(storage, document)
  return { document, error, blocked: false, raw: null }
}

export function saveDocument(storage, document) {
  try {
    validateDocument(document)
    storage.setItem(STORAGE_KEY, JSON.stringify(document))
    return null
  } catch (error) { return message(error) }
}
