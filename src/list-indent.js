import { markdownTree, walk } from './markdown-model.js'

/** Four spaces: the common editor default, and valid under both `- ` and `1. ` markers. */
export const INDENT = '    '

const LIST_LINE = /^([ \t]*)(?:[-*+]|\d+[.)])(?: |$)/

function lineStarts(text) {
  const starts = [0]
  for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) starts.push(at + 1)
  return starts
}

const width = (space) => space.replace(/\t/g, INDENT).length

/**
 * Indents or outdents the list items touched by the selection `from`-`to`.
 *
 * Returns the edits as non-overlapping `{ from, to, insert }` changes in ascending
 * order, or null when no list item is touched (so the caller can leave Tab alone).
 * An empty list of changes means the key was meant for a list but nothing can move:
 * the first item of a list cannot be indented, or the item is already at the margin.
 */
export function listIndentChanges(text, from, to, outdent = false) {
  const starts = lineStarts(text)
  const lineAt = (position) => {
    let line = starts.length - 1
    while (starts[line] > position) line--
    return line
  }
  const first = lineAt(from)
  let last = lineAt(to)
  if (last > first && to === starts[last]) last--
  const code = []
  const items = new Map()
  walk(markdownTree(text), (node) => {
    if (node.type === 'code') code.push([node.position.start.line - 1, node.position.end.line - 1])
    if (node.type === 'listItem') items.set(node.position.start.line - 1, node)
  })
  const lines = text.split('\n')
  const continuationLines = new Set()
  for (const item of items.values())
    for (let line = item.position.start.line; line < item.position.end.line; line++)
      continuationLines.add(line)
  const isList = (index) =>
    LIST_LINE.test(lines[index]) && !code.some(([start, end]) => index >= start && index <= end)
  const touched = []
  for (let index = first; index <= last; index++) {
    const quoted =
      outdent &&
      /^[ \t]*>/.test(lines[index]) &&
      !code.some(([start, end]) => index >= start && index <= end)
    if (isList(index) || quoted) touched.push(index)
  }
  if (!touched.length) return null

  // Indentation after the edit, so a moved block keeps its shape.
  const indents = lines.map((line) => width(line.match(/^[ \t]*/)[0]))
  // Is there an item at this indentation above, in the same list (not past its parent)?
  const hasSibling = (index, indent) => {
    for (let above = index - 1; above >= 0; above--) {
      if (!lines[above].trim()) continue
      if (!isList(above)) {
        if (/^[ \t]/.test(lines[above])) continue
        return false
      }
      if (indents[above] === indent) return true
      if (indents[above] < indent) return false
    }
    return false
  }
  const changes = []
  const moved = new Set()
  for (const index of touched) {
    if (moved.has(index)) continue
    const space = lines[index].match(/^[ \t]*/)[0]
    const moveChildren = () => {
      const item = items.get(index)
      if (!item) return
      for (let child = index + 1; child < item.position.end.line; child++) {
        moved.add(child)
        if (!lines[child].trim()) continue
        const prefix = lines[child].match(/^[ \t]*/)[0]
        const remove = prefix.startsWith('\t') ? 1 : Math.min(INDENT.length, prefix.length)
        changes.push({
          from: starts[child],
          to: starts[child] + (outdent ? remove : 0),
          insert: outdent ? '' : INDENT,
        })
        indents[child] += outdent ? -width(prefix.slice(0, remove)) : INDENT.length
      }
    }
    if (outdent) {
      // Quotes carry their own indentation marker, hidden in the visual editor.
      // Remove one quote level while retaining the list marker and its text.
      const quote = lines[index].match(/^[ \t]*> ?/)
      if (quote) {
        changes.push({ from: starts[index], to: starts[index] + quote[0].length, insert: '' })
        continue
      }
      if (!space) continue
      const remove = space.startsWith('\t') ? 1 : Math.min(INDENT.length, space.length)
      changes.push({ from: starts[index], to: starts[index] + remove, insert: '' })
      indents[index] = Math.max(
        0,
        indents[index] - (space.startsWith('\t') ? INDENT.length : remove),
      )
      moveChildren()
      continue
    }
    // Only nest under a previous item, and at most one level below it.
    let parent = null
    for (let above = index - 1; above >= 0; above--) {
      if (!lines[above].trim()) continue
      if (isList(above)) parent = indents[above]
      else if (!/^[ \t]/.test(lines[above]) && !(first === last && continuationLines.has(above)))
        break
      if (parent !== null) break
    }
    if (parent === null || indents[index] + INDENT.length > parent + INDENT.length) continue
    changes.push({ from: starts[index], to: starts[index], insert: INDENT })
    indents[index] += INDENT.length
    moveChildren()
    // Only "1." can start a list inside a paragraph, so the first item of a new sublist restarts.
    const number = lines[index].match(/^([ \t]*)(\d+)(?=[.)])/)
    if (number && number[2] !== '1' && !hasSibling(index, indents[index])) {
      const at = starts[index] + number[1].length
      changes.push({ from: at, to: at + number[2].length, insert: '1' })
    }
  }
  return changes.sort((a, b) => a.from - b.from || a.to - b.to)
}

export function applyChanges(text, changes) {
  let result = ''
  let at = 0
  for (const change of changes) {
    result += text.slice(at, change.from) + change.insert
    at = change.to
  }
  return result + text.slice(at)
}

export function mapPosition(position, changes) {
  let shift = 0
  for (const change of changes) {
    if (change.from >= position && !(change.from === change.to && change.from === position)) break
    shift += change.insert.length - (Math.min(change.to, position) - change.from)
    if (change.to > position) break
  }
  return position + shift
}
