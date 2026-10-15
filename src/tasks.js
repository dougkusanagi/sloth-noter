import { headingSections } from './sections.js'

const TASK = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\](?:\s+(.*))?$/
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
          done: match[2] !== ' ',
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
  if (box !== ' ' && box !== 'x' && box !== 'X') return body
  return body.slice(0, mark) + (box === ' ' ? 'x' : ' ') + body.slice(mark + 1)
}

/** Done/total tasks under each H2–H6 (subsections included), keyed by heading line. */
export function sectionProgress(body, tasks = noteTasks(body)) {
  const progress = new Map()
  if (!tasks.length) return progress
  for (const heading of headingSections(body)) {
    if (heading.level === 0) continue
    const inside = tasks.filter((task) => task.line > heading.titleEnd && task.line <= heading.end)
    if (inside.length)
      progress.set(heading.line, {
        done: inside.filter((task) => task.done).length,
        total: inside.length,
      })
  }
  return progress
}
