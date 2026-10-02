import test from 'node:test'
import assert from 'node:assert/strict'
import { readNoteFile, splitDrop } from './note-drop.js'

test('Markdown and text files are split from images', () => {
  const files = [{ name: 'a.md' }, { name: 'B.TXT' }, { name: 'c.png' }, { name: 'd.markdown' }]
  const { notes, others } = splitDrop(files)
  assert.deepEqual(
    notes.map((file) => file.name),
    ['a.md', 'B.TXT', 'd.markdown'],
  )
  assert.deepEqual(
    others.map((file) => file.name),
    ['c.png'],
  )
})

test('native drops are read by the backend and browser files directly', async () => {
  const calls = []
  const invoke = async (command, args) => (calls.push({ command, args }), '# Native')
  assert.equal(await readNoteFile({ nativePath: '/n/a b.md', name: 'a b.md' }, invoke), '# Native')
  assert.deepEqual(calls, [{ command: 'note_read_dropped', args: { path: '/n/a b.md' } }])
  assert.equal(await readNoteFile({ name: 'a.md', text: async () => '# Web' }), '# Web')
})
