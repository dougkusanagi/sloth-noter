import test from 'node:test'
import assert from 'node:assert/strict'
import { quickOpenNotes } from './quick-open.js'

const notes = ['closed', 'alpha', 'beta'].map((id) => ({ id, name: `${id}.md` }))
test('quick open prioritizes tabs in strip order without duplicating library notes', () => {
  assert.deepEqual(
    quickOpenNotes(notes, ['beta', 'alpha']).map(({ id, tabNumber }) => [id, tabNumber]),
    [
      ['beta', 1],
      ['alpha', 2],
      ['closed', undefined],
    ],
  )
})
test('filtering retains tab positions and supports accents', () => {
  assert.equal(quickOpenNotes(notes, ['beta', 'alpha'], 'alpha')[0].tabNumber, 2)
  assert.equal(quickOpenNotes([{ id: 'x', name: 'Inventário.md' }], [], 'inventario').length, 1)
  assert.equal(quickOpenNotes(notes, ['missing'], 'missing').length, 0)
})

test('filtering prioritizes exact and prefix title matches over partial matches', () => {
  const list = [
    { id: 'sub', name: 'Descontas.md' },
    { id: 'word', name: 'Minhas Contas.md' },
    { id: 'prefix', name: 'Contas a pagar.md' },
    { id: 'exact', name: '👀 Contas.md' },
  ]
  assert.deepEqual(
    quickOpenNotes(list, [], 'contas').map((note) => note.id),
    ['exact', 'prefix', 'word', 'sub'],
  )
  assert.equal(quickOpenNotes(list, [], 'md').length, 0)
})
