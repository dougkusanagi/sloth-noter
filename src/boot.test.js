import test from 'node:test'
import assert from 'node:assert/strict'
import { openWorkspace } from './boot.js'
import { newDocument } from './storage.js'

function fakePersistence(loaded, failures = {}) {
  const saved = []
  return {
    saved,
    kind: 'test',
    label: 'test',
    async load() {
      return loaded
    },
    async save(document) {
      saved.push(document)
      return failures.save ?? null
    },
  }
}

test('reconciles headings with filenames and stores the result once', async () => {
  const document = {
    ...newDocument(),
    notes: [{ id: 'a', name: 'old.md', body: '# Plano\n', revision: 0 }],
    openIds: ['a'],
    activeId: 'a',
  }
  const persistence = fakePersistence({ document, error: null, blocked: false, raw: null })
  const opened = await openWorkspace(persistence)
  assert.equal(opened.document.notes[0].name, 'Plano.md')
  assert.equal(opened.error, null)
  assert.equal(persistence.saved.length, 1)
})

test('a blocked storage is returned without reconciling or writing', async () => {
  const loaded = {
    document: newDocument(),
    error: 'Invalid saved notes',
    blocked: true,
    raw: '{bad',
  }
  const persistence = fakePersistence(loaded)
  const opened = await openWorkspace(persistence)
  assert.deepEqual(opened, loaded)
  assert.equal(persistence.saved.length, 0)
})

test('a failing reconciliation write still opens the editor', async () => {
  const document = {
    ...newDocument(),
    notes: [{ id: 'a', name: 'old.md', body: '# Plano\n', revision: 0 }],
    openIds: ['a'],
    activeId: 'a',
  }
  const persistence = fakePersistence(
    { document, error: null, blocked: false, raw: null },
    { save: 'quota exceeded' },
  )
  const opened = await openWorkspace(persistence)
  assert.equal(opened.error, 'quota exceeded')
  assert.equal(opened.document.notes[0].name, 'Plano.md')
})
