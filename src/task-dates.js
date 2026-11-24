import { currentLanguage, t } from './i18n.js'

/**
 * The `✅ AAAA-MM-DD` / `❌ AAAA-MM-DD` suffix written when a task is closed (Obsidian Tasks
 * format, ADR 0034). The file keeps ISO dates; the interface shows them in the active locale.
 */
const STAMP = /[ \t]+([✅❌])[ \t]+(\d{4})-(\d{2})-(\d{2})[ \t]*$/u

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

/** Accessible text of the badge, e.g. "Concluída em 23/11/2026". */
export function taskDateLabel(stamp) {
  return t(stamp.kind === 'done' ? 'task.doneOn' : 'task.canceledOn', {
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
