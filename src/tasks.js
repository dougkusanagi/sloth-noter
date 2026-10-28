import { findNote, wikiReferences, markdownTree, walk, wikiParts } from './markdown-model.js'
import { headingSections } from './sections.js'

const TASK = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX-])\](?:\s+(.*))?$/
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
          done: /[xX]/.test(match[2]),
          partial: match[2] === '-',
          text: (match[3] ?? '').trim(),
          depth: match[1].replace(/\t/g, '    ').length,
        })
    }
    offset += text.length + 1
  })
  return tasks
}

/** Flips the task whose box sits at `mark`. */
export function toggleTask(body, mark) {
  const box = body[mark]
  if (box !== ' ' && box !== 'x' && box !== 'X' && box !== '-') return body
  return body.slice(0, mark) + (/[xX]/.test(box) ? ' ' : 'x') + body.slice(mark + 1)
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
    const task = resolvedTasks('- [ ] ' + text.replace(/^#+\s*/, ''), notes)[0]
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
    if (inside.length || linkedTotal)
      progress.set(heading.line, {
        done: inside.filter((task) => task.done).length + linkedDone,
        total: inside.length + linkedTotal,
      })
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
      (task) => !task.progress && task.line > heading.titleEnd && task.line <= heading.end,
    )
    if (!editable.length) continue
    const done = editable.filter((task) => task.done).length
    checklists.set(heading.line, {
      title: titles.get(heading.line) ?? '',
      done,
      total: editable.length,
      partial: done < editable.length && editable.some((task) => task.done || task.partial),
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
export function resolvedTasks(body, notes = [], ancestors = new Set()) {
  return noteTasks(body).map((task) => {
    if (!task.text.includes('[[')) return task
    const targets = [...new Set(wikiReferences(task.text).map((link) => link.target))]
    if (!targets.length) return task
    const children = []
    for (const target of targets) {
      const note = findNote(notes, target)
      if (!note || ancestors.has(note) || cyclicChecklist(note, notes, ancestors)) continue
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
    const done = children.filter((item) => item.done).length
    return {
      ...task,
      done: done === children.length,
      partial: done < children.length && children.some((item) => item.done || item.partial),
      progress: { done, total: children.length },
    }
  })
}

/** Persist automatic task marks together with the edit that changed their checklist. */
export function syncLinkedTasks(notes) {
  return notes.map((note) => {
    if (!note.body.includes('[[')) return note
    let body = note.body
    for (const task of resolvedTasks(body, notes, new Set([note])).reverse()) {
      if (!task.progress) continue
      const mark = task.done ? 'x' : task.partial ? '-' : ' '
      body = body.slice(0, task.mark) + mark + body.slice(task.mark + 1)
    }
    return body === note.body ? note : { ...note, body, revision: note.revision + 1 }
  })
}

/** GFM has no partial task syntax; adapt it before converting the Markdown tree to HTML. */
export function remarkPartialTasks() {
  return (tree) =>
    walk(tree, (node) => {
      if (node.type !== 'listItem' || node.checked != null) return
      const first = node.children?.[0]?.children?.[0]
      if (first?.type === 'text' && /^\[-\](?:\s|$)/.test(first.value)) {
        node.checked = false
        first.value = first.value.replace(/^\[-\]\s?/, '')
      }
    })
}
