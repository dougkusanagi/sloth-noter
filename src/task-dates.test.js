import test from 'node:test'
import assert from 'node:assert/strict'
import { formatTaskDate, taskDate, taskDateQuery, taskMatches } from './task-dates.js'
import { noteSearchResult } from './note-search.js'

test('taskDate splits the closing stamp from the text', () => {
  assert.deepEqual(taskDate('Pagar conta ✅ 2026-11-23'), {
    index: 11,
    length: 13,
    kind: 'done',
    iso: '2026-11-23',
    text: 'Pagar conta',
  })
  assert.equal(taskDate('Reunião ❌ 2026-01-05').kind, 'canceled')
  assert.equal(taskDate('Data 2026-11-23 no meio'), null)
})

test('formatTaskDate follows the language', () => {
  assert.equal(formatTaskDate('2026-11-23', 'pt-BR'), '23/11/2026')
  assert.equal(formatTaskDate('2026-11-23', 'en'), '11/23/2026')
  assert.equal(formatTaskDate('2026-02-31', 'pt-BR'), '2026-02-31')
})

test('date queries match the stored ISO dates', () => {
  const text = 'Pagar conta ✅ 2026-11-23'
  for (const query of [
    '23/11/2026',
    '23/11',
    '2026-11-23',
    'concluída:23/11',
    'concluida:2026-11',
    'done:',
  ])
    assert.ok(taskMatches(text, query), query)
  for (const query of ['24/11', 'cancelada:23/11', '23/11/2025'])
    assert.equal(taskMatches(text, query), false, query)
  assert.equal(taskDateQuery('conta'), null)
  assert.equal(taskDateQuery('https://x'), null)
})

test('note search finds a task by its Brazilian date', () => {
  const note = { name: 'Casa', body: '- [x] Pagar conta ✅ 2026-11-23\n' }
  assert.equal(noteSearchResult(note, '23/11/2026').snippet.hit, '2026-11-23')
  assert.equal(noteSearchResult(note, 'concluída:23/11').snippet.hit, '✅ 2026-11-23')
})
