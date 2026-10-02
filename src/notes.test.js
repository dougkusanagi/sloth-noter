import test from 'node:test'
import assert from 'node:assert/strict'
import {
  headingFileName,
  isDiscardableEmptyNote,
  nameFromHeading,
  reconcileHeadingNames,
} from './notes.js'

test('identifies untouched new notes that can be discarded', () => {
  assert.equal(isDiscardableEmptyNote({ name: 'new note.md', body: '', revision: 0 }), true)
  assert.equal(isDiscardableEmptyNote({ name: 'new note (7).md', body: '', revision: 0 }), true)
  assert.equal(isDiscardableEmptyNote({ name: 'new note.md', body: 'text', revision: 1 }), false)
  assert.equal(isDiscardableEmptyNote({ name: 'untitled.md', body: '', revision: 0 }), false)
})

test('uses the first H1 as a note filename', () => {
  assert.equal(nameFromHeading('intro\n# Título\n# Outro', [], 'a'), 'Título.md')
  assert.equal(
    nameFromHeading('# Título novo\n', [{ id: 'a', name: 'Antigo.md' }], 'a'),
    'Título novo.md',
  )
  assert.equal(nameFromHeading('sem título', [], 'a'), null)
})

test('makes H1 filenames portable and resolves conflicts', () => {
  const notes = [
    { id: 'a', name: 'old.md' },
    { id: 'b', name: 'Plano.md' },
  ]
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
  assert.deepEqual(
    next.notes.map((note) => note.name),
    ['Plano.md', 'Plano (2).md', 'untitled.md'],
  )
  assert.deepEqual(
    next.notes.map((note) => note.body),
    notes.map((note) => note.body),
  )
  assert.strictEqual(reconcileHeadingNames(next), next)
  assert.equal(headingFileName('# A/B'), 'A-B.md')
})

test('reconciliation preserves existing duplicate-heading names regardless of file order', () => {
  const document = {
    notes: [
      { id: 'b', name: 'new note (2).md', body: '# new note\nsecond', revision: 0 },
      { id: 'a', name: 'new note.md', body: '# new note\nfirst', revision: 0 },
      { id: 'c', name: 'new note (10).md', body: '# new note\nthird', revision: 0 },
    ],
  }
  assert.strictEqual(reconcileHeadingNames(document), document)
})

test('reconciliation reserves valid heading names before naming other notes', () => {
  const document = {
    notes: [
      { id: 'a', name: 'old.md', body: '# Plano\nfirst', revision: 0 },
      { id: 'b', name: 'Plano.md', body: '# Plano\nsecond', revision: 0 },
      { id: 'c', name: 'Plano (2).md', body: '# Plano\nthird', revision: 0 },
    ],
  }
  const next = reconcileHeadingNames(document)
  assert.equal(next.notes[0].name, 'Plano (3).md')
  assert.strictEqual(next.notes[1], document.notes[1])
  assert.strictEqual(next.notes[2], document.notes[2])
  assert.strictEqual(reconcileHeadingNames(next), next)
})
