import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newDocument, validateDocument } from './storage.js'
import { newMobileNote, renameMobileNote, updateMobileNote } from './mobile/note-actions.js'

test('mobile creation and title edits keep a valid document and unique filenames', () => {
  const original = newDocument()
  const created = newMobileNote(original, 'Compras', 'shopping')
  assert.equal(created.notes[0].body, '# Compras')
  assert.equal(created.activeId, 'shopping')
  assert.equal(original.notes.length, 1)
  const duplicate = newMobileNote(created, 'Compras', 'duplicate')
  assert.equal(duplicate.notes[0].name, 'Compras (2).md')
  const edited = updateMobileNote(duplicate, 'shopping', '# Reunião\n\nação 🦥')
  assert.equal(edited.notes.find((note) => note.id === 'shopping').name, 'Reunião.md')
  validateDocument(edited)
})

test('renaming a title updates wiki references in active and trashed notes', () => {
  let document = newMobileNote(newDocument(), 'Compras', 'shopping')
  document = {
    ...document,
    notes: [
      ...document.notes,
      { id: 'link', name: 'Link.md', body: '# Link\n[[Compras]]', revision: 0 },
    ],
    trash: [
      {
        note: { id: 'deleted', name: 'Deleted.md', body: '# Deleted\n[[Compras]]', revision: 0 },
        index: 0,
        deletedAt: 0,
      },
    ],
  }
  const next = renameMobileNote(document, 'shopping', 'Mercado').document
  assert.equal(next.notes.at(-1).body, '# Link\n[[Mercado]]')
  assert.equal(next.trash[0].note.body, '# Deleted\n[[Mercado]]')
  assert.equal(updateMobileNote(next, 'shopping', '# Mercado'), next)
  assert.equal(updateMobileNote(next, 'missing', '# Missing'), next)
})

test('external notes keep their filename and do not acquire a mandatory title', () => {
  const document = newMobileNote(newDocument(), 'External', 'external')
  document.notes[0].external = { path: '/tmp/external.md' }
  const next = updateMobileNote(document, 'external', 'plain text')
  assert.equal(next.notes[0].body, 'plain text')
  assert.equal(next.notes[0].name, 'External.md')
})

test('explicit rename rejects duplicates, invalid names and external files', () => {
  const document = newMobileNote(newDocument(), 'Compras', 'shopping')
  assert.equal(renameMobileNote(document, 'shopping', '').error, 'mobile.invalidName')
  assert.equal(renameMobileNote(document, 'shopping', 'a/b').error, 'mobile.invalidName')
  const duplicate = newMobileNote(document, 'Outro', 'other')
  assert.equal(renameMobileNote(duplicate, 'shopping', 'outro').error, 'error.nameExists')
  const next = renameMobileNote(document, 'shopping', 'Mercado.md').document
  assert.equal(next.notes[0].body, '# Mercado')
  document.notes[0].external = { path: '/tmp/a.md' }
  assert.equal(renameMobileNote(document, 'shopping', 'Novo').error, 'external.noRename')
})
