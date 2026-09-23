import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDocument, saveDocument, newDocument, STORAGE_KEY, LEGACY_KEY } from './storage.js'

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
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 2)
  assert.ok(storage.getItem(LEGACY_KEY))
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

test('accepts no open tab and rejects inconsistent active note', () => {
  const storage = memoryStorage()
  const document = { ...newDocument(), openIds: [], activeId: null }
  assert.equal(saveDocument(storage, document), null)
  assert.equal(saveDocument(storage, { ...document, activeId: 'welcome' }), 'Invalid active note')
})
