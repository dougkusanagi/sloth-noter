import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatTaskDate,
  stripTaskDates,
  taskDate,
  taskDateQuery,
  taskDates,
  taskDueState,
  taskMatches,
  taskStampText,
} from './task-dates.js'
import { setLanguage } from './i18n.js'
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

test('taskDates extracts due, scheduled, start and closing stamps', () => {
  setLanguage('pt-BR')
  const line = 'Entregar relatório 🛫 2026-11-20 ⏳ 2026-11-22 📅 2026-11-25'
  const stamps = taskDates(line)
  assert.deepEqual(
    stamps.map((s) => [s.kind, s.iso]),
    [
      ['start', '2026-11-20'],
      ['scheduled', '2026-11-22'],
      ['due', '2026-11-25'],
    ],
  )
  assert.equal(stripTaskDates(line), 'Entregar relatório')
  const now = new Date(2026, 10, 25, 12, 0)
  assert.equal(taskDueState('2026-11-23', now), 'overdue')
  assert.equal(taskDueState('2026-11-25', now), 'today')
  assert.equal(taskDueState('2026-11-26', now), 'soon')
  assert.equal(taskDueState('2026-12-10', now), 'future')
  assert.equal(
    taskStampText({ kind: 'due', iso: '2026-11-23' }, now, 'pt-BR'),
    'atrasada há 2 dias',
  )
  assert.equal(taskStampText({ kind: 'due', iso: '2026-11-25' }, now, 'pt-BR'), 'vence hoje')
  assert.equal(taskStampText({ kind: 'due', iso: '2026-11-26' }, now, 'pt-BR'), 'vence amanhã')
  assert.equal(taskStampText({ kind: 'due', iso: '2026-11-28' }, now, 'pt-BR'), 'vence em 3 dias')
  assert.equal(taskStampText({ kind: 'scheduled', iso: '2026-11-22' }, now, 'pt-BR'), '22/11/2026')
})
