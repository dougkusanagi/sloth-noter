import {
  TASK_LINE,
  archiveRange,
  blockEnd,
  fencedLines,
  headingsOf,
  indentOf,
  isBlank,
  tidy,
  trimBlank,
} from './task-archive.js'
import { CHAR_BY_STATUS, applyStatus, taskStatus } from './tasks.js'

/** Board columns, in order. Canceled cards sit in the "done" column. */
export const BOARD_COLUMNS = ['todo', 'doing', 'waiting', 'done']
export const columnOf = (status) => (status === 'canceled' ? 'done' : status)

const TASK_TEXT = /^\s*(?:[-*+]|\d+[.)])\s+\[.\]\s?(.*)$/

/**
 * The tasks of a note as a board: lanes are the H2 sections (the `## Arquivo` section is left
 * out), cards are the top-level tasks with their subtasks. `mark` is the offset of the box.
 */
export function parseBoard(body) {
  const lines = body.split('\n')
  const headings = headingsOf(lines)
  const fenced = fencedLines(lines)
  const archive = archiveRange(lines, headings)
  const offsets = []
  let at = 0
  for (const line of lines) {
    offsets.push(at)
    at += line.length + 1
  }
  const lanes = [{ title: '', heading: -1, cards: [] }]
  for (let i = 0; i < lines.length; i++) {
    if (archive && i >= archive.start && i <= archive.end) continue
    if (headings[i]) {
      if (headings[i].level === 1) {
        if (lanes.at(-1).heading >= 0) lanes.push({ title: '', heading: -1, cards: [] })
      } else if (headings[i].level === 2)
        lanes.push({ title: headings[i].title, heading: i, cards: [] })
      continue
    }
    if (fenced[i] || !TASK_LINE.test(lines[i])) continue
    const last = blockEnd(lines, i)
    const lane = lanes.at(-1)
    const children = []
    for (let k = i + 1; k <= last; k++) {
      const child = TASK_LINE.exec(lines[k])
      if (child && !fenced[k])
        children.push({ text: TASK_TEXT.exec(lines[k])[1], status: taskStatus(child[2]) })
    }
    lane.cards.push({
      mark: offsets[i] + lines[i].indexOf('[') + 1,
      line: i,
      last,
      status: taskStatus(TASK_LINE.exec(lines[i])[2]),
      text: TASK_TEXT.exec(lines[i])[1],
      children,
    })
    i = last
  }
  // The implicit lane (tasks before any H2) only shows up when it has cards or is the only one.
  const all = lanes.filter((lane) => lane.heading >= 0 || lane.cards.length)
  if (!all.length) all.push(lanes[0])
  return { lanes: all }
}

/** Index where a block added to `laneTitle` goes: after its last non-blank line. */
function laneInsertion(lines, headings, laneTitle) {
  const archive = archiveRange(lines, headings)
  const limit = archive ? archive.start : lines.length
  let start = 0
  let end = limit
  if (laneTitle) {
    const heading = headings.findIndex(
      (h, i) => h && h.level === 2 && h.title === laneTitle && i < limit,
    )
    if (heading < 0) return null
    start = heading + 1
    for (let i = start; i < limit; i++)
      if (headings[i] && headings[i].level <= 2) {
        end = i
        break
      }
  } else {
    const first = headings.findIndex((h, i) => i > 0 && h && h.level === 2 && i < limit)
    end = first < 0 ? limit : first
    start = headings[0]?.level === 1 ? 1 : 0
  }
  let index = end
  while (index > start && isBlank(lines[index - 1])) index--
  return { index, end, afterTask: index > start && TASK_LINE.test(lines[index - 1]) }
}

function place(lines, laneTitle, block) {
  const headings = headingsOf(lines)
  const spot = laneInsertion(lines, headings, laneTitle)
  if (!spot) return null
  const before = lines.slice(0, spot.index)
  const after = lines.slice(spot.index)
  const gap = spot.afterTask || !before.length ? [] : ['']
  const tail = after.length && !isBlank(after[0]) ? [''] : []
  return [...before, ...gap, ...block, ...tail, ...after]
}

const finish = (lines, endsWithNewline) => tidy(lines).join('\n') + (endsWithNewline ? '\n' : '')

/** Sets the status of a card (the status of its first line; subtasks keep theirs). */
export function setCardStatus(body, mark, status) {
  return applyStatus(body, mark, status)
}

/** Moves a card, with its subtasks and indented lines, to the end of another lane. */
export function moveCardToLane(body, mark, laneTitle) {
  const card = parseBoard(body)
    .lanes.flatMap((lane) => lane.cards)
    .find((item) => item.mark === mark)
  if (!card) return body
  const lines = body.split('\n')
  const block = trimBlank(lines.slice(card.line, card.last + 1))
  const rest = lines.filter((_, i) => i < card.line || i > card.last)
  // The target lane is found by title again, now that the lines shifted.
  const placed = place(rest, laneTitle, block)
  return placed ? finish(placed, body.endsWith('\n')) : body
}

const allCards = (body) => parseBoard(body).lanes.flatMap((lane) => lane.cards)

/**
 * Drops a card, as on a kanban: sets its column (`status`) and places its block right before the
 * card `before`, or at the end of `laneTitle` when `before` is null. With `laneTitle` undefined
 * and no `before`, the card stays where it is in the text.
 */
export function dropCard(body, mark, { status, laneTitle, before = null } = {}) {
  const card = allCards(body).find((item) => item.mark === mark)
  if (!card) return body
  const next = status && columnOf(card.status) !== status ? applyStatus(body, mark, status) : body
  // A status change only rewrites the card's own line, so line numbers stay valid.
  const moved = allCards(next).find((item) => item.line === card.line)
  if (before === null || before === undefined) {
    if (laneTitle === undefined) return next
    const lane = parseBoard(next).lanes.find((item) =>
      item.cards.some((entry) => entry.line === moved.line),
    )
    if (lane?.title === laneTitle && lane.cards.at(-1).line === moved.line) return next
    return moveCardToLane(next, moved.mark, laneTitle)
  }
  // Marks are offsets and the status change can shift them; lines stay put.
  const line = allCards(body).find((item) => item.mark === before)?.line
  const target = allCards(next).find((item) => item.line === line)
  if (!target || target.line === moved.line) return next
  const lines = next.split('\n')
  const block = trimBlank(lines.slice(moved.line, moved.last + 1))
  const out = []
  lines.forEach((line, index) => {
    if (index === target.line) out.push(...block)
    if (index < moved.line || index > moved.last) out.push(line)
  })
  return finish(out, next.endsWith('\n'))
}

/** Rewrites the text of a card's first line, keeping its marker, box and subtasks. */
export function setCardText(body, mark, text) {
  const card = allCards(body).find((item) => item.mark === mark)
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!card || !clean) return body
  const lines = body.split('\n')
  const prefix = /^\s*(?:[-*+]|\d+[.)])\s+\[.\]/.exec(lines[card.line])[0]
  lines[card.line] = `${prefix} ${clean}`
  return lines.join('\n')
}

/** Adds a task with `status` to the end of a lane (or of the note, before the archive). */
export function addBoardTask(body, laneTitle, status, text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || !(status in CHAR_BY_STATUS)) return body
  const block = [`- [${CHAR_BY_STATUS[status]}] ${clean}`]
  const lines = body.split('\n')
  const placed = place(lines, laneTitle, block) ?? place(lines, '', block)
  return finish(placed, body.endsWith('\n') || !body.trim() ? true : false)
}

export { indentOf }
