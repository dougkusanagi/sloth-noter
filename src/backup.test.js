import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackup, readBackup } from './backup.js'
import { newDocument } from './storage.js'

test('backup round trip preserves notes, trash, tabs and preferences', () => {
  const document = newDocument()
  document.notes[0].body = 'olá\n\nlast line\n'
  document.trash.push({ note: { id: 'deleted', name: 'deleted.md', body: '🦥\n', revision: 1 }, index: 0, deletedAt: 123 })
  assert.deepEqual(readBackup(createBackup(document)), document)
})

test('rejects malformed or inconsistent backups', () => {
  assert.throws(() => readBackup('{bad'))
  assert.throws(() => readBackup(JSON.stringify({ ...newDocument(), activeId: 'missing' })), /Invalid active note/)
})
