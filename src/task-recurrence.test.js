import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNextRecurringTaskLine,
  dueReminders,
  extractCompletionHistory,
  nextRecurrenceDate,
  parseTaskRecurrence,
  parseTaskReminder,
} from './task-recurrence.js'

test('C4: parses recurrence, computes next occurrence, history, and due reminders', () => {
  assert.deepEqual(parseTaskRecurrence('- [ ] Pagar conta 🔁 mensal 📅 2026-11-26'), {
    interval: 1,
    unit: 'month',
  })
  assert.deepEqual(parseTaskRecurrence('- [ ] Revisar 🔁 every 3 days'), {
    interval: 3,
    unit: 'day',
  })
  assert.equal(nextRecurrenceDate('2026-11-26', { interval: 1, unit: 'week' }), '2026-12-03')

  const next = buildNextRecurringTaskLine(
    '- [x] Pagar conta 🔁 mensal 📅 2026-11-26 ✅ 2026-11-26',
    '2026-11-26',
  )
  assert.equal(next, '- [ ] Pagar conta 🔁 mensal 📅 2026-12-26')

  const history = extractCompletionHistory(
    '# Tarefas\n- [x] A ✅ 2026-11-20\n- [x] B ✅ 2026-11-26\n',
  )
  assert.equal(history.length, 2)
  assert.equal(history[0].date, '2026-11-26')

  assert.deepEqual(parseTaskReminder('- [ ] Ligar ⏰ 2026-11-26 14:30'), {
    date: '2026-11-26',
    time: '14:30',
    iso: '2026-11-26T14:30:00',
  })
  const reminders = dueReminders(
    [
      {
        id: 'n1',
        body: '# Hoje\n- [ ] Ligar ⏰ 2026-11-26 10:00\n- [ ] Futuro ⏰ 2026-11-26 18:00\n- [x] Feito ⏰ 2026-11-26 09:00\n',
      },
    ],
    '2026-11-26T13:00:00',
  )
  assert.equal(reminders.length, 1)
  assert.equal(reminders[0].noteId, 'n1')
})
