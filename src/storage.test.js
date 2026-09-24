import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDocument, saveDocument, newDocument, STORAGE_KEY, V2_KEY, LEGACY_KEY } from './storage.js'
import { moveToTrash, restoreFromTrash, purgeFromTrash } from './notes.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value) }
}

test('creates and restores an empty note and preferences', () => {
  const storage = memoryStorage()
  const first = loadDocument(storage)
  assert.equal(first.error, null)
  const note = { id: 'empty', name: 'empty.md', body: '', revision: 0 }
  const document = { ...first.document, notes: [...first.document.notes, note], openIds: ['empty'], activeId: 'empty', preferences: { tabsVisible: false, theme: 'dark', fontSize: 20 } }
  assert.equal(saveDocument(storage, document), null)
  assert.deepEqual(loadDocument(storage).document, document)
})

test('migrates v1 notes without changing their text', () => {
  const storage = memoryStorage()
  const body = '# olá\n\nlast line\n'
  storage.setItem(LEGACY_KEY, JSON.stringify({ version: 1, notes: [{ id: 'a', name: 'a.md', body, revision: 5 }], activeId: 'a' }))
  const loaded = loadDocument(storage)
  assert.equal(loaded.error, null)
  assert.equal(loaded.document.notes[0].body, body)
  assert.deepEqual(loaded.document.openIds, ['a'])
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 3)
  assert.ok(storage.getItem(LEGACY_KEY))
})

test('migrates v2 notes and preserves the old storage record', () => {
  const storage = memoryStorage()
  const v2 = { ...newDocument(), version: 2 }
  delete v2.trash
  v2.notes[0].body = 'first\n\nlast\n'
  storage.setItem(V2_KEY, JSON.stringify(v2))
  const loaded = loadDocument(storage)
  assert.equal(loaded.error, null)
  assert.equal(loaded.document.notes[0].body, 'first\n\nlast\n')
  assert.deepEqual(loaded.document.trash, [])
  assert.ok(storage.getItem(V2_KEY))
})

test('retains readable legacy notes in memory if migration cannot be written', () => {
  const legacy = { ...newDocument(), version: 2 }
  delete legacy.trash
  legacy.notes[0].body = 'important\n'
  const storage = { getItem: key => key === V2_KEY ? JSON.stringify(legacy) : null, setItem: () => { throw new Error('quota exceeded') } }
  const loaded = loadDocument(storage)
  assert.equal(loaded.document.notes[0].body, 'important\n')
  assert.match(loaded.error, /quota exceeded/)
  assert.equal(loaded.blocked, false)
})

test('corrupted storage is blocked and remains available for recovery', () => {
  const storage = memoryStorage()
  storage.setItem(STORAGE_KEY, '{bad')
  const loaded = loadDocument(storage)
  assert.ok(loaded.error)
  assert.equal(loaded.blocked, true)
  assert.equal(loaded.raw, '{bad')
  assert.equal(storage.getItem(STORAGE_KEY), '{bad')
})

test('reports failed writes while retaining the in-memory document', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota exceeded') } }
  assert.match(loadDocument(storage).error, /quota exceeded/)
  const document = newDocument()
  assert.match(saveDocument(storage, document), /quota exceeded/)
  assert.equal(document.notes[0].body.includes('Welcome'), true)
})

test('blocks writes when existing storage cannot be read', () => {
  const storage = { getItem: () => { throw new Error('read denied') }, setItem: () => { throw new Error('write denied') } }
  const loaded = loadDocument(storage)
  assert.match(loaded.error, /read denied/)
  assert.equal(loaded.blocked, true)
  assert.equal(loaded.raw, null)
})

test('accepts no open tab and rejects inconsistent active note', () => {
  const storage = memoryStorage()
  const document = { ...newDocument(), openIds: [], activeId: null }
  assert.equal(saveDocument(storage, document), null)
  assert.equal(saveDocument(storage, { ...document, activeId: 'welcome' }), 'Invalid active note')
})

test('deleted notes survive reload and can be restored without changing text', () => {
  const storage = memoryStorage()
  const document = newDocument()
  document.notes[0].body = 'olá\n\nfinal\n'
  const deleted = moveToTrash(document, 'welcome', 1234)
  assert.equal(deleted.notes.length, 0)
  assert.equal(deleted.activeId, null)
  assert.equal(saveDocument(storage, deleted), null)
  const restored = restoreFromTrash(loadDocument(storage).document, 'welcome')
  assert.equal(restored.notes[0].body, 'olá\n\nfinal\n')
  assert.equal(restored.trash.length, 0)
  assert.equal(restored.activeId, 'welcome')
})

test('restoring a deleted note resolves name conflicts; permanent deletion removes it', () => {
  const deleted = moveToTrash(newDocument(), 'welcome', 1234)
  const conflicting = { ...deleted, notes: [{ id: 'other', name: 'welcome.md', body: '', revision: 0 }], openIds: ['other'], activeId: 'other' }
  const restored = restoreFromTrash(conflicting, 'welcome')
  assert.equal(restored.notes.find(note => note.id === 'welcome').name, 'Welcome (2).md')
  assert.equal(purgeFromTrash(deleted, 'welcome').trash.length, 0)
})
