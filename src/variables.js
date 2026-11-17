import { frontmatterEnd, propertyMap } from './frontmatter.js'
import { currentLanguage, t } from './i18n.js'
import { noteTasks } from './tasks.js'
import { textStatistics } from './text-statistics.js'

/** `{{name}}` and `{{name:argument}}`; names are lowercase words with `.`, `_` or `-`. */
export const VARIABLE = /\{\{\s*([a-z][a-z0-9_.-]*)(?::([^{}]*?))?\s*\}\}/g

const DAY = 24 * 60 * 60 * 1000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function dateOnly(value) {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getMonth() === Number(match[2]) - 1 ? date : null
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY)

function formatValue(entry, language) {
  const { type, value } = entry
  if (type === 'boolean') return t(value ? 'variables.yes' : 'variables.no')
  if (type === 'number') return new Intl.NumberFormat(language).format(value)
  if (type === 'date') {
    const date = dateOnly(value)
    return date ? new Intl.DateTimeFormat(language).format(date) : value
  }
  if (type === 'list') return value.map(String).join(', ')
  return String(value)
}

/**
 * The text of one variable, or `{ error }` with a message for the chip's tooltip. Values are
 * only text: nothing is run, and a variable never expands into another.
 * Context: `{ body, modifiedAt, now, language }`.
 */
export function resolveVariable(name, argument, context) {
  const { body, modifiedAt, now = new Date(), language = currentLanguage() } = context
  const text = body.slice(frontmatterEnd(body))
  if (name === 'today') return { text: new Intl.DateTimeFormat(language).format(now) }
  if (name === 'updated') {
    if (!modifiedAt) return { text: '' }
    const at = new Date(modifiedAt)
    const days = daysBetween(at, now)
    if (days <= 0)
      return {
        text: t('variables.updatedToday', {
          time: new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(
            at,
          ),
        }),
      }
    return { text: t('variables.updatedDays', { count: days }) }
  }
  if (name === 'words') {
    return {
      text: new Intl.NumberFormat(language).format(textStatistics(text.replace(/^# /, '')).words),
    }
  }
  if (name === 'reading') {
    const words = textStatistics(text).words
    return { text: t('variables.readingMinutes', { count: Math.max(1, Math.ceil(words / 200)) }) }
  }
  if (name === 'tasks') {
    const tasks = noteTasks(body).filter((task) => !task.archived && task.status !== 'canceled')
    return {
      text: t('variables.tasksOf', {
        done: tasks.filter((task) => task.status === 'done').length,
        total: tasks.length,
      }),
    }
  }
  if (name === 'until') {
    const target = dateOnly((argument ?? '').trim())
    if (!target) return { error: t('variables.invalidDate') }
    const days = daysBetween(now, target)
    if (days === 0) return { text: t('variables.untilToday') }
    return {
      text: t(days > 0 ? 'variables.untilFuture' : 'variables.untilPast', {
        count: Math.abs(days),
      }),
    }
  }
  if (name.startsWith('user.')) {
    const key = name.slice(5)
    const entry = propertyMap(body).get(key)
    return entry
      ? { text: formatValue(entry, language) }
      : { error: t('variables.missing', { name: key }) }
  }
  return { error: t('variables.unknown', { name }) }
}

/** Every variable of a line outside inline code: `{ from, to, name, argument }` (line offsets). */
export function lineVariables(line) {
  const code = []
  for (const match of line.matchAll(/(`+)(?:(?!\1)[^])*?\1/g))
    code.push([match.index, match.index + match[0].length])
  const found = []
  for (const match of line.matchAll(VARIABLE)) {
    const from = match.index
    if (code.some(([start, end]) => from >= start && from < end)) continue
    found.push({ from, to: from + match[0].length, name: match[1], argument: match[2] })
  }
  return found
}
