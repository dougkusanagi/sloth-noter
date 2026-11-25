import { currentLanguage, t } from './i18n.js'

/**
 * Task date stamps following the Obsidian Tasks format (ADR 0004, ADR 0044):
 * `📅 YYYY-MM-DD` (due), `⏳ YYYY-MM-DD` (scheduled), `🛫 YYYY-MM-DD` (start),
 * `✅ YYYY-MM-DD` (done), `❌ YYYY-MM-DD` (canceled).
 */
const STAMP = /[ \t]+([✅❌])[ \t]+(\d{4})-(\d{2})-(\d{2})[ \t]*$/u
const ANY_STAMP = /(?:^|[ \t]+)([📅⏳🛫✅❌])[ \t]+(\d{4})-(\d{2})-(\d{2})(?=$|[ \t])/gu
const KINDS = { '📅': 'due', '⏳': 'scheduled', '🛫': 'start', '✅': 'done', '❌': 'canceled' }
const DAY = 24 * 60 * 60 * 1000

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** All task date stamps in a line (`due`, `scheduled`, `start`, `done`, `canceled`). */
export function taskDates(text) {
  const result = []
  for (const match of text.matchAll(ANY_STAMP)) {
    const [, mark, year, month, day] = match
    result.push({
      index: match.index,
      length: match[0].length,
      mark,
      kind: KINDS[mark],
      iso: `${year}-${month}-${day}`,
    })
  }
  return result
}

/** Removes all task date stamps from a task text for clean display. */
export function stripTaskDates(text) {
  return text
    .replace(ANY_STAMP, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Urgency state of a due date: `'overdue' | 'today' | 'soon' | 'future'`. */
export function taskDueState(iso, now = new Date()) {
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(year, month - 1, day)
  if (target.getMonth() !== month - 1) return 'future'
  const days = Math.round((startOfDay(target) - startOfDay(now)) / DAY)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 2) return 'soon'
  return 'future'
}

/** Short visible text for a task date chip (relative for due dates, formatted otherwise). */
export function taskStampText(stamp, now = new Date(), language = currentLanguage()) {
  if (stamp.kind === 'due') {
    const [year, month, day] = stamp.iso.split('-').map(Number)
    const target = new Date(year, month - 1, day)
    if (target.getMonth() === month - 1) {
      const days = Math.round((startOfDay(target) - startOfDay(now)) / DAY)
      if (days < 0) return t('task.overdue', { count: Math.abs(days) })
      if (days === 0) return t('task.dueToday')
      if (days === 1) return t('task.dueTomorrow')
      if (days <= 7) return t('task.dueIn', { count: days })
    }
  }
  return formatTaskDate(stamp.iso, language)
}

/** Splits a task text into the text before the stamp and the stamp itself. */
export function taskDate(text) {
  const match = STAMP.exec(text)
  if (!match) return null
  const [, mark, year, month, day] = match
  return {
    index: match.index,
    length: match[0].length,
    kind: mark === '✅' ? 'done' : 'canceled',
    iso: `${year}-${month}-${day}`,
    text: text.slice(0, match.index),
  }
}

/** `2026-11-23` → `23/11/2026` in pt-BR, following the active language. */
export function formatTaskDate(iso, language = currentLanguage()) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getMonth() !== month - 1) return iso
  return new Intl.DateTimeFormat(language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/** Accessible text of the badge, e.g. "Concluída em 23/11/2026" or "Prazo: 23/11/2026". */
export function taskDateLabel(stamp) {
  const key =
    {
      done: 'task.doneOn',
      canceled: 'task.canceledOn',
      due: 'task.dueOn',
      scheduled: 'task.scheduledOn',
      start: 'task.startOn',
    }[stamp.kind] ?? 'task.dueOn'
  return t(key, {
    date: formatTaskDate(stamp.iso),
  })
}

const DONE_PREFIX = /^(?:conclu[íi]das?|feitas?|done|completed)$/i
const CANCELED_PREFIX = /^(?:canceladas?|canceled|cancelled)$/i
const pad = (value) => value.padStart(2, '0')

/**
 * Turns a date query into a regex over the stored ISO dates, so `23/11/2026`, `23/11`
 * and `concluída:23/11` find `✅ 2026-11-23`. Returns null for ordinary text.
 */
export function taskDateQuery(query) {
  let text = query.trim()
  let mark = ''
  const prefix = /^([\p{L}]+):\s*/u.exec(text)
  if (prefix) {
    if (DONE_PREFIX.test(prefix[1])) mark = '✅'
    else if (CANCELED_PREFIX.test(prefix[1])) mark = '❌'
    else return null
    text = text.slice(prefix[0].length)
  }
  let date
  const br = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(text)
  const iso = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(text)
  if (br) date = `${br[3] ?? String.raw`\d{4}`}-${pad(br[2])}-${pad(br[1])}`
  else if (mark && iso)
    date = [
      iso[1],
      iso[2] ? pad(iso[2]) : String.raw`\d{2}`,
      iso[3] ? pad(iso[3]) : String.raw`\d{2}`,
    ].join('-')
  else if (mark && !text) date = String.raw`\d{4}-\d{2}-\d{2}`
  else return null
  return mark ? `${mark}[ \\t]+${date}` : `(?<!\\d)${date}(?!\\d)`
}

/** Whether a task text matches a search, including its closing date in any format. */
export function taskMatches(text, query) {
  const needle = query.trim()
  if (!needle) return true
  const pattern = taskDateQuery(needle)
  if (pattern) return new RegExp(pattern, 'u').test(text)
  return text.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}
