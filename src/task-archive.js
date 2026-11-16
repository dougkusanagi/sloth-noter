import { isArchiveTitle, noteTasks } from './tasks.js'

const FENCE = /^\s*(`{3,}|~{3,})/
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/
const TASK_LINE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[(.)\]/
const indentOf = (line) => line.match(/^\s*/)[0].replace(/\t/g, '    ').length
const isBlank = (line) => !line.trim()

/** Heading (outside code fences) of every line, or null. */
function headingsOf(lines) {
  let fence = null
  return lines.map((line) => {
    const opener = FENCE.exec(line)?.[1]
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) fence = null
      return null
    }
    if (opener) {
      fence = opener
      return null
    }
    const match = HEADING.exec(line)
    return match ? { level: match[1].length, title: match[2] } : null
  })
}

/** Lines inside (or delimiting) a code fence. */
function fencedLines(lines) {
  let fence = null
  return lines.map((line) => {
    const opener = FENCE.exec(line)?.[1]
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) fence = null
      return true
    }
    if (opener) {
      fence = opener
      return true
    }
    return false
  })
}

/** First and last line (inclusive) of the `## Arquivo` section, or null. */
function archiveRange(lines, headings) {
  const start = headings.findIndex((h) => h && h.level === 2 && isArchiveTitle(h.title))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++)
    if (headings[i] && headings[i].level <= 2) {
      end = i
      break
    }
  return { start, end: end - 1 }
}

/** Lines of the task block that starts at `index`: the task plus deeper-indented lines. */
function blockEnd(lines, index) {
  const base = indentOf(lines[index])
  let last = index
  for (let i = index + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue
    if (indentOf(lines[i]) > base) last = i
    else break
  }
  return last
}

const closedChar = (char) => char === 'x' || char === 'X' || char === '-'

/** True when the task at `index` and every task inside its block are done or canceled. */
function blockClosed(lines, index, last) {
  for (let i = index; i <= last; i++) {
    const match = TASK_LINE.exec(lines[i])
    if (match && !closedChar(match[2])) return false
  }
  return true
}

/** Splits archive lines into a preamble and `###` groups. */
function parseArchive(lines) {
  const heads = headingsOf(lines)
  const preamble = []
  const groups = []
  lines.forEach((line, i) => {
    if (heads[i]?.level === 3) groups.push({ title: heads[i].title, lines: [] })
    else (groups.at(-1)?.lines ?? preamble).push(line)
  })
  return { preamble, groups }
}

const trimBlank = (lines) => {
  let from = 0
  let to = lines.length
  while (from < to && isBlank(lines[from])) from++
  while (to > from && isBlank(lines[to - 1])) to--
  return lines.slice(from, to)
}

function renderArchive(title, preamble, groups) {
  const out = [`## ${title}`]
  const intro = trimBlank(preamble)
  if (intro.length) out.push('', ...intro)
  for (const group of groups) {
    const body = trimBlank(group.lines)
    out.push('', `### ${group.title}`)
    if (body.length) out.push('', ...body)
  }
  return out
}

/** Collapses runs of blank lines left behind by the removed blocks. */
function tidy(lines) {
  const fenced = fencedLines(lines)
  const out = []
  lines.forEach((line, index) => {
    if (!fenced[index] && isBlank(line) && (!out.length || isBlank(out.at(-1)))) return
    out.push(line)
  })
  while (out.length && isBlank(out.at(-1))) out.pop()
  return out
}

/**
 * Moves finished tasks (done or canceled, with all their subtasks and indented lines) into the
 * `## Arquivo` section, grouped under `### <origin section>`. Returns the new text and how many
 * tasks moved. The note is untouched when nothing qualifies.
 */
export function archiveClosedTasks(body, title = 'Arquivo') {
  const lines = body.split('\n')
  const headings = headingsOf(lines)
  const fenced = fencedLines(lines)
  const archive = archiveRange(lines, headings)
  const moved = []
  const taken = new Set()
  let origin = null
  for (let i = 0; i < lines.length; i++) {
    if (archive && i >= archive.start && i <= archive.end) continue
    if (headings[i]) {
      origin = headings[i].level >= 2 ? headings[i].title : null
      continue
    }
    if (fenced[i] || !TASK_LINE.test(lines[i])) continue
    const last = blockEnd(lines, i)
    if (!blockClosed(lines, i, last)) {
      // An open task keeps its whole block, finished subtasks included.
      i = last
      continue
    }
    const block = lines.slice(i, last + 1)
    moved.push({ origin, lines: trimBlank(block) })
    for (let k = i; k <= last; k++) taken.add(k)
    i = last
  }
  if (!moved.length) return { body, count: 0 }
  const count = moved.reduce(
    (sum, item) => sum + item.lines.filter((line) => TASK_LINE.test(line)).length,
    0,
  )
  const kept = lines.filter((_, index) => !taken.has(index))
  const keptHeadings = headingsOf(kept)
  const range = archiveRange(kept, keptHeadings)
  const existing = range ? kept.slice(range.start + 1, range.end + 1) : []
  const { preamble, groups } = parseArchive(existing)
  for (const item of moved) {
    if (item.origin === null) {
      if (trimBlank(preamble).length) preamble.push(...item.lines)
      else preamble.splice(0, preamble.length, ...item.lines)
      continue
    }
    let group = groups.find((entry) => entry.title === item.origin)
    if (!group) groups.push((group = { title: item.origin, lines: [] }))
    const current = trimBlank(group.lines)
    group.lines = [...current, ...item.lines]
  }
  const archived = renderArchive(
    range ? kept[range.start].replace(/^##\s+/, '') : title,
    preamble,
    groups,
  )
  const before = tidy(range ? kept.slice(0, range.start) : kept)
  const after = range ? kept.slice(range.end + 1) : []
  const result = [...before, '', ...archived, ...(trimBlank(after).length ? ['', ...after] : [])]
  return { body: result.join('\n').replace(/^\n+/, '') + '\n', count }
}

/**
 * Moves the archived task at `mark` (offset of its box) back to the section it came from,
 * or to the end of the note, before the archive, when that section no longer exists.
 */
export function unarchiveTask(body, mark) {
  const lines = body.split('\n')
  const headings = headingsOf(lines)
  const archive = archiveRange(lines, headings)
  const task = archive && noteTasks(body).find((item) => item.mark === mark)
  if (!task || task.line - 1 <= archive.start || task.line - 1 > archive.end) return body
  const index = task.line - 1
  // Climb to the top-level task of the block that contains the line.
  let top = index
  for (let i = index - 1; i > archive.start && !headings[i]; i--)
    if (
      TASK_LINE.test(lines[i]) &&
      indentOf(lines[i]) < indentOf(lines[top]) &&
      blockEnd(lines, i) >= index
    )
      top = i
  const last = blockEnd(lines, top)
  let group = -1
  for (let i = top - 1; i > archive.start; i--)
    if (headings[i]?.level === 3) {
      group = i
      break
    }
  const origin = group >= 0 ? headings[group].title : null
  const block = trimBlank(lines.slice(top, last + 1))
  const drop = new Set()
  for (let i = top; i <= last; i++) drop.add(i)
  if (group >= 0) {
    // A group left without tasks disappears with its heading.
    let next = group + 1
    while (next <= archive.end && (drop.has(next) || isBlank(lines[next]))) next++
    if (next > archive.end || headings[next]) for (let i = group; i < next; i++) drop.add(i)
  }
  const rest = lines.filter((_, i) => !drop.has(i))
  const restHeadings = headingsOf(rest)
  const archiveAt = restHeadings.findIndex((h) => h && h.level === 2 && isArchiveTitle(h.title))
  let insertAt = archiveAt
  const target =
    origin === null ? -1 : restHeadings.findIndex((h, i) => i < archiveAt && h?.title === origin)
  if (target >= 0) {
    const next = restHeadings.findIndex((h, i) => i > target && i <= archiveAt && h)
    insertAt = next
  }
  const before = rest.slice(0, insertAt)
  while (before.length && isBlank(before.at(-1))) before.pop()
  const after = rest.slice(insertAt)
  const joined = before.length && !(target >= 0 && TASK_LINE.test(before.at(-1))) ? [''] : []
  const result = [...before, ...joined, ...block, '', ...after]
  return tidy(result).join('\n') + '\n'
}
