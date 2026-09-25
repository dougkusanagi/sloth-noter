import test from 'node:test'
import assert from 'node:assert/strict'
import { headingFileName, isDiscardableEmptyNote, nameFromHeading, reconcileHeadingNames } from './notes.js'

test('identifies untouched new notes that can be discarded', () => {
  assert.equal(isDiscardableEmptyNote({ name: 'new note.md', body: '', revision: 0 }), true)
  assert.equal(isDiscardableEmptyNote({ name: 'new note (7).md', body: '', revision: 0 }), true)
  assert.equal(isDiscardableEmptyNote({ name: 'new note.md', body: 'text', revision: 1 }), false)
  assert.equal(isDiscardableEmptyNote({ name: 'untitled.md', body: '', revision: 0 }), false)
})

test('uses the first H1 as a note filename', () => {
  assert.equal(nameFromHeading('intro\n# Título\n# Outro', [], 'a'), 'Título.md')
  assert.equal(nameFromHeading('# Título novo\n', [{ id: 'a', name: 'Antigo.md' }], 'a'), 'Título novo.md')
  assert.equal(nameFromHeading('sem título', [], 'a'), null)
})

test('makes H1 filenames portable and resolves conflicts', () => {
  const notes = [{ id: 'a', name: 'old.md' }, { id: 'b', name: 'Plano.md' }]
  assert.equal(nameFromHeading('# Plano', notes, 'a'), 'Plano (2).md')
  assert.equal(nameFromHeading('# A/B: C?', notes, 'a'), 'A-B- C-.md')
  assert.equal(headingFileName('# **Meu título**'), 'Meu título.md')
  assert.equal(headingFileName('# CON'), '_CON.md')
})

test('reconciles saved notes with their headings without changing bodies', () => {
  const notes = [
    { id: 'a', name: 'old.md', body: '# Plano\nfirst', revision: 0 },
    { id: 'b', name: 'other.md', body: '# Plano\nsecond', revision: 1 },
    { id: 'c', name: 'untitled.md', body: 'no H1', revision: 2 },
  ]
  const document = { notes }
  const next = reconcileHeadingNames(document)
  assert.deepEqual(next.notes.map(note => note.name), ['Plano.md', 'Plano (2).md', 'untitled.md'])
  assert.deepEqual(next.notes.map(note => note.body), notes.map(note => note.body))
  assert.strictEqual(reconcileHeadingNames(next), next)
  assert.equal(headingFileName('# A/B'), 'A-B.md')
})
