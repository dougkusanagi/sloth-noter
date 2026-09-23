import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDocument, saveDocument, STORAGE_KEY } from './storage.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value) }
}

test('creates and restores a document including an empty note', () => {
  const storage = memoryStorage()
  const first = loadDocument(storage)
  assert.equal(first.error, null)
  const document = { ...first.document, notes: [...first.document.notes, { id: 'empty', name: 'empty.md', body: '', revision: 0 }], activeId: 'empty' }
  assert.equal(saveDocument(storage, document), null)
  assert.deepEqual(loadDocument(storage).document, document)
})

test('reports corrupted storage and does not overwrite it on load', () => {
  const storage = memoryStorage()
  storage.setItem(STORAGE_KEY, '{bad')
  assert.ok(loadDocument(storage).error)
  assert.equal(storage.getItem(STORAGE_KEY), '{bad')
})

test('reports failed writes', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota exceeded') } }
  assert.match(loadDocument(storage).error, /quota exceeded/)
  assert.match(saveDocument(storage, { version: 1, notes: [{ id: 'a', name: 'a.md', body: 'olá\n\n', revision: 1 }], activeId: 'a' }), /quota exceeded/)
})
