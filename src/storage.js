export const STORAGE_KEY = 'sloth-note:v2'
export const LEGACY_KEY = 'sloth-note:v1'

export function newDocument() {
  return {
    version: 2,
    notes: [{ id: 'welcome', name: 'welcome.md', body: '# Welcome\n\nWrite here. Changes are saved in this browser as you type. Use Export .md for a separate copy.', revision: 0 }],
    openIds: ['welcome'],
    activeId: 'welcome',
    preferences: { tabsVisible: true, theme: 'system', fontSize: 18 },
  }
}

export function validateDocument(value) {
  if (!value || value.version !== 2 || !Array.isArray(value.notes) || !Array.isArray(value.openIds)) throw new Error('Invalid saved notes')
  const ids = new Set()
  for (const note of value.notes) {
    if (!note || typeof note.id !== 'string' || !note.id || ids.has(note.id) || typeof note.name !== 'string' || !note.name || typeof note.body !== 'string' || !Number.isSafeInteger(note.revision) || note.revision < 0) throw new Error('Invalid saved note')
    ids.add(note.id)
  }
  if (new Set(value.openIds).size !== value.openIds.length || value.openIds.some(id => !ids.has(id))) throw new Error('Invalid open tabs')
  if (value.activeId !== null && (!ids.has(value.activeId) || !value.openIds.includes(value.activeId))) throw new Error('Invalid active note')
  if ((value.openIds.length === 0) !== (value.activeId === null)) throw new Error('Invalid active note')
  const prefs = value.preferences
  if (!prefs || typeof prefs.tabsVisible !== 'boolean' || !['system', 'light', 'dark'].includes(prefs.theme) || !Number.isInteger(prefs.fontSize) || prefs.fontSize < 14 || prefs.fontSize > 24) throw new Error('Invalid preferences')
  return value
}

function migrateV1(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.notes) || value.notes.length === 0) throw new Error('Invalid legacy notes')
  const migrated = { version: 2, notes: value.notes, openIds: value.notes.map(note => note.id), activeId: value.activeId, preferences: { tabsVisible: true, theme: 'system', fontSize: 18 } }
  return validateDocument(migrated)
}

function message(error) { return error instanceof Error ? error.message : 'Storage is unavailable' }

export function loadDocument(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw !== null) return { document: validateDocument(JSON.parse(raw)), error: null, blocked: false, raw: null }
    const legacy = storage.getItem(LEGACY_KEY)
    const document = legacy === null ? newDocument() : migrateV1(JSON.parse(legacy))
    storage.setItem(STORAGE_KEY, JSON.stringify(document))
    return { document, error: null, blocked: false, raw: null }
  } catch (error) {
    let raw = null
    try { raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_KEY) } catch { /* unavailable */ }
    return { document: newDocument(), error: message(error), blocked: raw !== null, raw }
  }
}

export function saveDocument(storage, document) {
  try {
    validateDocument(document)
    storage.setItem(STORAGE_KEY, JSON.stringify(document))
    return null
  } catch (error) { return message(error) }
}
