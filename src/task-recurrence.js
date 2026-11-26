const RECURRENCE_RE =
  /🔁\s*(?:(di[aá]ria|daily|semanal|weekly|mensal|monthly)|(?:a cada|every)\s+(\d+)\s+(dias?|days?|semanas?|weeks?|mes(?:es)?|months?))/i
const REMINDER_RE = /⏰\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/
const DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/
const DONE_DATE_RE = /✅\s*(\d{4}-\d{2}-\d{2})/

/** Parses a portable recurrence rule (`🔁 diária`, `🔁 weekly`, `🔁 every 3 days`, etc.). */
export function parseTaskRecurrence(line) {
  const match = RECURRENCE_RE.exec(String(line ?? ''))
  if (!match) return null
  if (match[1]) {
    const word = match[1].toLowerCase()
    if (word.startsWith('di') || word === 'daily') return { interval: 1, unit: 'day' }
    if (word.startsWith('sem') || word === 'weekly') return { interval: 1, unit: 'week' }
    return { interval: 1, unit: 'month' }
  }
  const interval = Math.max(1, Number.parseInt(match[2], 10) || 1)
  const rawUnit = match[3].toLowerCase()
  const unit =
    rawUnit.startsWith('dia') || rawUnit.startsWith('day')
      ? 'day'
      : rawUnit.startsWith('sem') || rawUnit.startsWith('week')
        ? 'week'
        : 'month'
  return { interval, unit }
}

/** Parses an inline local reminder (`⏰ YYYY-MM-DD HH:MM`). */
export function parseTaskReminder(line) {
  const match = REMINDER_RE.exec(String(line ?? ''))
  if (!match) return null
  const [, date, time] = match
  return { date, time, iso: `${date}T${time}:00` }
}

/** Computes the next ISO date (`YYYY-MM-DD`) for a recurrence rule. */
export function nextRecurrenceDate(isoDate, rule) {
  if (!rule || !/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate ?? ''))) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (rule.unit === 'day') dt.setUTCDate(dt.getUTCDate() + rule.interval)
  else if (rule.unit === 'week') dt.setUTCDate(dt.getUTCDate() + rule.interval * 7)
  else if (rule.unit === 'month') dt.setUTCMonth(dt.getUTCMonth() + rule.interval)
  return dt.toISOString().slice(0, 10)
}

/** Builds the next open Markdown task line when a recurring task is completed. */
export function buildNextRecurringTaskLine(line, todayIso) {
  const rule = parseTaskRecurrence(line)
  if (!rule) return null
  const dueMatch = DUE_RE.exec(line)
  const baseDate = dueMatch ? dueMatch[1] : todayIso
  const nextDate = nextRecurrenceDate(baseDate, rule)
  if (!nextDate) return null

  let next = line
    .replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)[ xX/\->]\]/, '$1 ]')
    .replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/g, '')
    .replace(/\s*❌\s*\d{4}-\d{2}-\d{2}/g, '')
  if (DUE_RE.test(next)) {
    next = next.replace(DUE_RE, `📅 ${nextDate}`)
  } else {
    next = `${next.trimEnd()} 📅 ${nextDate}`
  }
  return next
}

/** Extracts chronological completion history (`✅ YYYY-MM-DD`) from a note body. */
export function extractCompletionHistory(body) {
  const entries = []
  const lines = String(body ?? '').split('\n')
  lines.forEach((line, index) => {
    const match = DONE_DATE_RE.exec(line)
    if (!match) return
    entries.push({
      line: index + 1,
      date: match[1],
      text: line.replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[^\]]\]\s*/, '').trim(),
    })
  })
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

/** Finds open tasks whose local reminder (`⏰`) is due at or before `nowIso`. */
export function dueReminders(notes, nowIso) {
  const due = []
  for (const note of notes ?? []) {
    const lines = String(note?.body ?? '').split('\n')
    lines.forEach((line, index) => {
      if (!/^\s*(?:[-*+]|\d+[.)])\s+\[ \]/.test(line)) return
      const reminder = parseTaskReminder(line)
      if (!reminder || reminder.iso > nowIso) return
      due.push({
        noteId: note.id,
        line: index + 1,
        reminder,
        text: line.replace(/^\s*(?:[-*+]|\d+[.)])\s+\[ \]\s*/, '').trim(),
      })
    })
  }
  return due
}
