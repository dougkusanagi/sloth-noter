import { findNote, wikiReferences, markdownTree, walk, wikiParts } from './markdown-model.js'
import { headingSections } from './sections.js'

// Unknown symbols such as `[?]` or `[!]` are tasks too; letters and digits are not, so `[1]` stays a reference.
const BOX = String.raw`[ xX]|[^\w\s[\]]`
const TASK = new RegExp(String.raw`^(\s*)(?:[-*+]|\d+[.)])\s+\[(${BOX})\](?:\s+(.*))?$`)
const BOX_ONLY = new RegExp(`^(?:${BOX})$`)
const isBox = (body, mark) =>
  body[mark - 1] === '[' && body[mark + 1] === ']' && BOX_ONLY.test(body[mark])
const STATUS_BY_CHAR = {
  ' ': 'todo',
  '/': 'doing',
  '>': 'waiting',
  x: 'done',
  X: 'done',
  '-': 'canceled',
}
const CHAR_BY_STATUS = { todo: ' ', doing: '/', waiting: '>', done: 'x', canceled: '-' }
export const TASK_STATUSES = Object.keys(CHAR_BY_STATUS)
/** Unknown characters count as "todo" and are never rewritten by the app. */
export const taskStatus = (char) => STATUS_BY_CHAR[char] ?? 'todo'
const linkedHeading = (line) => /^#{1,6}\s+\[\[[^\n]+?\]\]\s*#*\s*$/.test(line)
const FENCE = /^\s*(`{3,}|~{3,})/

/**
 * Every Markdown task (`- [ ] text`) of a note, outside code fences. `line` is 1-based,
 * `offset` is where the line starts and `mark` is the offset of the box's `x` or space,
 * so a task can be toggled or jumped to without parsing the note again.
 */
export function noteTasks(body) {
  const tasks = []
  let fence = null,
    offset = 0
  body.split('\n').forEach((text, index) => {
    const opener = FENCE.exec(text)?.[1]
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) fence = null
    } else if (opener) fence = opener
    else {
      const match = TASK.exec(text)
      if (match)
        tasks.push({
          line: index + 1,
          offset,
          mark: offset + text.indexOf('[') + 1,
          status: taskStatus(match[2]),
          done: /[xX]/.test(match[2]),
          partial: false,
          text: (match[3] ?? '').trim(),
          depth: match[1].replace(/\t/g, '    ').length,
        })
    }
    offset += text.length + 1
  })
  return tasks
}

/** Sets the status of the task whose box sits at `mark`. */
export function setTaskStatus(body, mark, status) {
  if (!isBox(body, mark) || !(status in CHAR_BY_STATUS)) return body
  return body.slice(0, mark) + CHAR_BY_STATUS[status] + body.slice(mark + 1)
}

/** App-wide choice, set from the preferences: write `✅`/`❌` dates when a task is closed. */
export const taskSettings = { dates: true }

/** Flips the task whose box sits at `mark` between "todo" and "done". */
export function toggleTask(body, mark) {
  return applyStatus(body, mark, taskStatus(body[mark]) === 'done' ? 'todo' : 'done')
}

/** Applies `taskStatusChanges` to the text (with the app-wide date choice). */
export function applyStatus(body, mark, status, options = taskSettings) {
  let result = '',
    at = 0
  for (const change of taskStatusChanges(body, mark, status, options)) {
    result += body.slice(at, change.from) + change.insert
    at = change.to
  }
  return result + body.slice(at)
}

/** Linked checklists contribute their underlying tasks; canceled tasks are left out. */
function taskTotals(tasks) {
  return tasks
    .filter((task) => task.status !== 'canceled')
    .reduce(
      (sum, task) => ({
        done: sum.done + (task.progress?.done ?? Number(task.done)),
        total: sum.total + (task.progress?.total ?? 1),
      }),
      { done: 0, total: 0 },
    )
}

/**
 * Done/total tasks under H2–H6, keyed by heading line. Expanded ancestors omit
 * totals carried entirely by a single subsection; collapsed sections keep their summary.
 */
export function sectionProgress(body, tasks = noteTasks(body), collapsed = new Set(), notes = []) {
  const progress = new Map()
  if (!tasks.length && !notes.length) return progress
  const headings = headingSections(body)
  const lines = body.split('\n')
  const linked = headings.flatMap((heading) => {
    const text = lines[heading.line - 1] ?? ''
    if (!text.includes('[[')) return []
    const task = resolvedTasks('- [ ] ' + text.replace(/^#+\s*/, ''), notes, new Set(), true)[0]
    return task?.progress ? [{ line: heading.line, ...task.progress }] : []
  })
  for (const heading of headings) {
    if (heading.level === 0) continue
    const linkedTitle = linkedHeading(lines[heading.line - 1] ?? '')
    const inside = linkedTitle
      ? []
      : tasks.filter((task) => task.line > heading.titleEnd && task.line <= heading.end)
    const referenced = linked.filter((item) =>
      linkedTitle
        ? item.line === heading.line
        : item.line >= heading.line && item.line <= heading.end,
    )
    const linkedTotal = referenced.reduce((sum, item) => sum + item.total, 0)
    const linkedDone = referenced.reduce((sum, item) => sum + item.done, 0)
    const own = taskTotals(inside)
    if (own.total + linkedTotal)
      progress.set(heading.line, { done: own.done + linkedDone, total: own.total + linkedTotal })
  }
  const redundant = headings.filter((heading) => {
    const total = progress.get(heading.line)?.total
    return (
      total &&
      !collapsed.has(heading.line) &&
      headings.some(
        (child) =>
          child.line > heading.titleEnd &&
          child.line <= heading.end &&
          child.level === heading.level + 1 &&
          progress.get(child.line)?.total === total,
      )
    )
  })
  for (const heading of redundant) progress.delete(heading.line)
  return progress
}

/** Editable tasks below each H2–H6, including nested subsections. */
export function sectionChecklists(body, tasks = noteTasks(body)) {
  if (!tasks.some((task) => !task.progress)) return new Map()
  const tree = markdownTree(body)
  const titles = new Map()
  for (const node of tree.children) {
    if (node.type !== 'heading') continue
    let title = ''
    walk(node, (child) => {
      if (child.type === 'text' || child.type === 'inlineCode') title += child.value
    })
    titles.set(node.position.start.line, title)
  }
  const checklists = new Map()
  const lines = body.split('\n')
  for (const heading of headingSections(body, tree)) {
    if (heading.level === 0 || linkedHeading(lines[heading.line - 1] ?? '')) continue
    const editable = tasks.filter(
      (task) =>
        !task.progress &&
        task.status !== 'canceled' &&
        task.line > heading.titleEnd &&
        task.line <= heading.end,
    )
    if (!editable.length) continue
    const done = editable.filter((task) => task.done).length
    checklists.set(heading.line, {
      title: titles.get(heading.line) ?? '',
      done,
      total: editable.length,
      partial:
        done < editable.length &&
        editable.some((task) => task.done || task.partial || task.status === 'doing'),
      marks: editable.map((task) => task.mark),
    })
  }
  return checklists
}

/** Only explicit checkboxes in this note change; linked summaries remain derived. */
export function sectionTaskChanges(body, line, checked, notes = []) {
  const section = sectionChecklists(body, resolvedTasks(body, notes)).get(line)
  const insert = checked ? 'x' : ' '
  return (section?.marks ?? [])
    .filter((mark) => body[mark] !== insert)
    .map((mark) => ({ from: mark, to: mark + 1, insert }))
}

// A cyclic dependency cannot supply an automatic completion state.
function cyclicChecklist(note, notes, path = new Set()) {
  if (path.has(note)) return true
  const next = new Set(path).add(note)
  return noteTasks(note.body).some(
    (task) =>
      task.text.includes('[[') &&
      wikiReferences(task.text).some((link) => {
        const target = findNote(notes, link.target)
        return target && cyclicChecklist(target, notes, next)
      }),
  )
}

/** Resolve linked checklists without modifying source. Cycles retain their manual state. */
export function resolvedTasks(body, notes = [], ancestors = new Set(), allowCyclicTargets = false) {
  return noteTasks(body).map((task) => {
    if (!task.text.includes('[[')) return task
    const targets = [...new Set(wikiReferences(task.text).map((link) => link.target))]
    if (!targets.length) return task
    const children = []
    for (const target of targets) {
      const note = findNote(notes, target)
      if (
        !note ||
        ancestors.has(note) ||
        (!allowCyclicTargets && cyclicChecklist(note, notes, ancestors))
      )
        continue
      const path = new Set(ancestors).add(note)
      let tasks = resolvedTasks(note.body, notes, path)
      const { heading } = wikiParts(target)
      if (heading) {
        const tree = markdownTree(note.body)
        const title = tree.children.find((node) => {
          if (node.type !== 'heading') return false
          let label = ''
          walk(node, (child) => {
            if (child.type === 'text' || child.type === 'inlineCode') label += child.value
          })
          return (
            label.normalize('NFC').toLocaleLowerCase() ===
            heading.normalize('NFC').toLocaleLowerCase()
          )
        })
        if (!title) continue
        const next = tree.children.find(
          (node) =>
            node.type === 'heading' &&
            node.depth <= title.depth &&
            node.position.start.line > title.position.start.line,
        )
        tasks = tasks.filter(
          (item) =>
            item.line > title.position.end.line && (!next || item.line < next.position.start.line),
        )
      }
      children.push(...tasks)
    }
    if (!children.length) return task
    const progress = taskTotals(children)
    const done = progress.done === progress.total
    const partial =
      progress.done < progress.total && children.some((item) => item.done || item.partial)
    // A linked task takes its status from the progress, never from the character read.
    return { ...task, status: done ? 'done' : partial ? 'doing' : 'todo', done, partial, progress }
  })
}

/** Persist automatic task marks together with the edit that changed their checklist. */
export function syncLinkedTasks(notes) {
  return notes.map((note) => {
    if (!note.body.includes('[[')) return note
    let body = note.body
    for (const task of resolvedTasks(body, notes, new Set([note])).reverse()) {
      if (!task.progress) continue
      const mark = task.done ? 'x' : task.partial ? '/' : ' '
      body = body.slice(0, task.mark) + mark + body.slice(task.mark + 1)
    }
    return body === note.body ? note : { ...note, body, revision: note.revision + 1 }
  })
}

/** GFM has no `[/]`, `[>]` or `[-]` task syntax; adapt them before converting the tree to HTML. */
export function remarkPartialTasks() {
  return (tree) =>
    walk(tree, (node) => {
      if (node.type !== 'listItem' || node.checked != null) return
      const first = node.children?.[0]?.children?.[0]
      const char = first?.type === 'text' && /^\[([/>-])\](?:\s|$)/.exec(first.value)?.[1]
      if (!char) return
      node.checked = false
      first.value = first.value.replace(/^\[[/>-]\]\s?/, '')
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, 'data-status': taskStatus(char) },
      }
    })
}

const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/**
 * Edits that give the task at `mark` a new status: the box character and, unless `dates` is
 * off, the `✅ AAAA-MM-DD` / `❌ AAAA-MM-DD` suffix (removed when the task is reopened).
 * Meant for a single transaction, so undo reverts both. Same status: no changes.
 */
export function taskStatusChanges(body, mark, status, { dates = true, date = new Date() } = {}) {
  if (!isBox(body, mark) || !(status in CHAR_BY_STATUS)) return []
  if (taskStatus(body[mark]) === status) return []
  const changes = []
  changes.push({ from: mark, to: mark + 1, insert: CHAR_BY_STATUS[status] })
  if (dates) {
    const lineEnd = body.indexOf('\n', mark)
    const end = lineEnd < 0 ? body.length : lineEnd
    const start = body.lastIndexOf('\n', mark) + 1
    const line = body.slice(start, end)
    const found = line.search(/[ \t]+[✅❌][ \t]+\d{4}-\d{2}-\d{2}(?:[ \t]*$)/u)
    const from = start + (found >= 0 ? found : line.trimEnd().length)
    const stamp = status === 'done' ? '✅' : status === 'canceled' ? '❌' : ''
    const insert = stamp ? ' ' + stamp + ' ' + localDate(date) : ''
    if (from !== end || insert) changes.push({ from, to: end, insert })
  }
  return changes
}
