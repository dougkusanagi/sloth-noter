import { propertyMap, writeProperty } from './frontmatter.js'
import { dropCard, parseBoard } from './task-board.js'
import { headingsOf, isBlank } from './task-archive.js'
import { isArchiveTitle } from './tasks.js'

// A task note (ADR 0033): its H2 sections are the board columns.
const KINDS = { tipo: 'tarefas', type: 'tasks' }

const plain = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

/** Whether the note is marked `tipo: tarefas` (or `type: tasks`). */
export function isTaskNote(body) {
  const properties = propertyMap(body)
  return Object.entries(KINDS).some(
    ([key, value]) => plain(properties.get(key)?.value ?? '') === value,
  )
}

const STATUS_BY_COLUMN = {
  todo: ['fazer', 'a fazer', 'para fazer', 'pendente', 'pendentes', 'todo', 'to do', 'backlog'],
  doing: ['fazendo', 'em andamento', 'em progresso', 'doing', 'in progress'],
  waiting: ['esperando', 'aguardando', 'em espera', 'bloqueado', 'waiting', 'blocked'],
  done: [
    'feito',
    'feita',
    'feitos',
    'feitas',
    'concluido',
    'concluida',
    'concluidos',
    'concluidas',
    'done',
  ],
}

/** The task status a column stands for, from its title; null for a column of the person's own. */
export function columnStatus(title) {
  const name = plain(title)
  return (
    Object.keys(STATUS_BY_COLUMN).find((status) => STATUS_BY_COLUMN[status].includes(name)) ?? null
  )
}

export const DEFAULT_COLUMNS = {
  'pt-BR': ['Fazer', 'Fazendo', 'Esperando', 'Feito'],
  en: ['To do', 'Doing', 'Waiting', 'Done'],
}

const isoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** H2 sections that are columns (the archive is not one). */
const columnHeadings = (body) =>
  headingsOf(body.split('\n')).filter(
    (heading) => heading && heading.level === 2 && !isArchiveTitle(heading.title),
  )

/**
 * Marks the note as a task note: `tipo: tarefas` and `criada: <today>` (kept when present), and
 * the default columns at the end when the note has no H2 section. Returns null when the
 * properties block cannot be edited safely.
 */
export function makeTaskNote(body, { now = new Date(), language = 'pt-BR' } = {}) {
  let next = isTaskNote(body) ? body : writeProperty(body, 'tipo', 'tarefas')
  if (next === null) return null
  if (!propertyMap(next).has('criada')) next = writeProperty(next, 'criada', isoDate(now)) ?? next
  if (!columnHeadings(next).length) {
    const lines = next.replace(/\n+$/, '').split('\n')
    const columns = DEFAULT_COLUMNS[language] ?? DEFAULT_COLUMNS['pt-BR']
    const added = columns.flatMap((title) => ['', `## ${title}`])
    next = [...lines, ...(lines.length && isBlank(lines.at(-1)) ? added.slice(1) : added), ''].join(
      '\n',
    )
  }
  return next
}

/** The board columns of a task note: the H2 sections, with their cards. */
export function boardColumns(body) {
  return parseBoard(body).lanes.map((lane) => ({ ...lane, status: columnStatus(lane.title) }))
}

/**
 * Moves a card to a column (an H2 title; '' for the tasks before any section), before the card
 * `before` or at the end. A column with a known name also sets the card's status.
 */
export function moveCardToColumn(body, mark, column, before = null) {
  const status = columnStatus(column) ?? undefined
  return dropCard(body, mark, { status, laneTitle: column, before })
}
