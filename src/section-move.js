import { headingSections } from './sections.js'

/**
 * Reorder whole heading sections (H2–H6) in a note.
 *
 * A section is the heading plus everything under it, up to the next heading of
 * the same or a higher rank. Blocks keep their own lines; blank-line seams are
 * only repaired where a move leaves two blocks touching. The result is always
 * one contiguous replace, derived from a line diff.
 *
 * Results follow the shape of `moveListItems`:
 * - `null` when `line` is not a section heading (the caller falls through),
 * - `{ changes: [], anchor, head }` when there is nothing to move,
 * - `{ changes: [{ from, to, insert }], anchor, head }` otherwise, where
 *   `from`/`to` are offsets in the original text and `anchor` is the moved
 *   heading's start in the new text.
 */

const lineOffsets = (text) => {
  const starts = [0]
  for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) starts.push(at + 1)
  return starts
}

/** One contiguous replace covering every line where the texts differ. */
function replaceChangedLines(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  let first = 0
  while (first < a.length && first < b.length && a[first] === b[first]) first++
  let trim = 0
  while (
    trim < a.length - first &&
    trim < b.length - first &&
    a[a.length - 1 - trim] === b[b.length - 1 - trim]
  )
    trim++
  const last = a.length - trim
  const offsets = lineOffsets(before)
  const start = (index) => (index >= offsets.length ? before.length : offsets[index])
  return {
    from: start(first),
    to: start(last),
    insert: b.slice(first, b.length - trim).join('\n') + (b.length - trim < b.length ? '\n' : ''),
  }
}

function moveSectionSpec(text, line, amount, relative) {
  const headings = headingSections(text)
  const self = headings.find((heading) => heading.line === line)
  if (!self || self.level < 1) return null
  const siblings = headings.filter((heading) => heading.level === self.level)
  const index = siblings.findIndex((heading) => heading.line === self.line)
  const target = relative ? index + amount : amount
  if (target < 0 || target >= siblings.length || target === index)
    return { changes: [], anchor: -1, head: -1 }
  const sibling = siblings[target]

  const endsNewline = text.endsWith('\n')
  const lines = text.split('\n')
  const start = self.line - 1
  const end = Math.min(self.end, lines.length)
  const block = lines.slice(start, end)
  let last = block.length
  while (last > 0 && !block[last - 1].trim()) last--
  const body = block.slice(0, last)

  const work = lines.slice()
  work.splice(start, end - start)
  // Inserting before the heading keeps the target section after the block;
  // inserting before its raw end puts the block after the whole section.
  let at = sibling.line < self.line ? sibling.line - 1 : Math.min(sibling.end, lines.length)
  if (at > start) at -= end - start
  let inserted = 0
  if (at > 0 && work[at - 1].trim()) {
    work.splice(at, 0, '')
    at++
    inserted++
  }
  work.splice(at, 0, ...body)
  inserted += body.length
  const after = at + body.length
  if (after < work.length && work[after].trim()) work.splice(after, 0, '')
  // The hole the block left: a blank only when content now touches on both sides.
  const hole = at <= start ? start + inserted : start
  if (hole > 0 && work[hole - 1].trim() && hole < work.length && work[hole].trim())
    work.splice(hole, 0, '')
  if (endsNewline) {
    if (work.length && work[work.length - 1] !== '') work.push('')
  } else {
    // The original had no final newline; separators must not grow one.
    while (work.length > 1 && work[work.length - 1] === '') work.pop()
  }

  const final = work.join('\n')
  const anchor = work.slice(0, at).reduce((offset, text) => offset + text.length + 1, 0)
  return { changes: [replaceChangedLines(text, final)], anchor, head: anchor }
}

/** Move the section on `line` by one sibling slot (keyboard stepping). */
export function moveSectionBy(text, line, direction) {
  return moveSectionSpec(text, line, direction, true)
}

/** Move the section on `line` to `slot` (0-based position among its siblings). */
export function moveSectionTo(text, line, slot) {
  const headings = headingSections(text)
  const self = headings.find((heading) => heading.line === line)
  if (!self || self.level < 1) return null
  return moveSectionSpec(
    text,
    line,
    Math.max(
      0,
      Math.min(headings.filter((heading) => heading.level === self.level).length - 1, slot),
    ),
    false,
  )
}
