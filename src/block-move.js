import { markdownTree } from './markdown-model.js'

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/
const TABLE_FLAGS = /^<!--\s*sloth:table\b/

function kindOf(node, list) {
  if (node.type === 'heading') return `h${node.depth}`
  if (node.type === 'listItem')
    return node.checked != null ? 'task' : list.ordered ? 'numbered' : 'list'
  if (node.type === 'code') return 'code'
  if (node.type === 'blockquote') return 'quote'
  if (node.type === 'table') return 'table'
  if (node.type === 'paragraph') return 'p'
  return 'other'
}

/**
 * The blocks a handle can act on, as 1-based line ranges: each top-level node,
 * except that lists split into their items (nested items stay with their
 * parent). The note title on line 1 is not a block.
 */
export function documentBlocks(text) {
  const blocks = []
  for (const node of markdownTree(text).children) {
    if (!node.position) continue
    const items = node.type === 'list' ? node.children : [node]
    for (const item of items) {
      const first = item.position.start.line
      const last = item.position.end.line
      if (first === 1 && item.type === 'heading' && item.depth === 1) continue
      blocks.push({ first, last, kind: kindOf(item, node), depth: item.depth ?? 0 })
    }
  }
  // A table's header comment belongs to the table.
  for (let index = blocks.length - 1; index > 0; index--) {
    const block = blocks[index - 1]
    if (blocks[index].kind === 'table' && block.first === block.last)
      if (block.last === blocks[index].first - 1 && TABLE_FLAGS.test(lineAt(text, block.first)))
        blocks.splice(index - 1, 2, { ...blocks[index], first: block.first })
  }
  return blocks
}

function lineAt(text, number) {
  return text.split('\n')[number - 1] ?? ''
}

/**
 * Moves lines `first..last` so they start at line `before` (or the end when
 * `before` is past the last line). Blank lines keep blocks apart, except
 * between list items, which stay in one list. Returns CodeMirror changes in
 * the original document's offsets, plus where the moved text starts in the
 * original coordinates (`insertAt`) and how many characters come before it
 * inside the insertion (`lead`), or null when nothing would move.
 */
export function moveBlockChanges(text, first, last, before) {
  const lines = text.split('\n')
  const count = lines.length
  const offset = (number) => {
    let position = 0
    for (let index = 1; index < number; index++) position += lines[index - 1].length + 1
    return position
  }
  const blank = (number) => number >= 1 && number <= count && !lines[number - 1].trim()
  const listItem = (number) => number >= 1 && number <= count && LIST_ITEM.test(lines[number - 1])
  const chunkIsList = listItem(first)
  // Dropping onto itself, or into the blank line right after it, changes nothing.
  const end = blank(last + 1) ? last + 1 : last
  if (before >= first && before <= end + 1 && before <= count) return null

  // Remove the block. A blank line goes with it only when it had blank lines
  // (or the document edge) on both sides, so nothing gets glued together.
  let from = offset(first)
  let to = offset(last) + lines[last - 1].length
  const blankAbove = first === 1 || blank(first - 1)
  if (blank(last + 1) && blankAbove)
    to = offset(last + 1) + lines[last].length + (last + 1 < count ? 1 : 0)
  else if (last < count) to += 1
  // The last block also takes the blank line above it, so no blank line trails.
  else if (first > 2 && blank(first - 1)) from = offset(first - 1) - 1
  else if (first > 1) from -= 1

  const chunk = lines.slice(first - 1, last).join('\n')
  let insert
  let insertAt
  let lead = 0
  if (before > count) {
    // At the end: right after the last line with text that is not moving.
    let previous = count
    while (previous > last && blank(previous)) previous--
    if (previous <= last) return null
    const tight = chunkIsList && listItem(previous)
    insertAt = offset(previous) + lines[previous - 1].length
    insert = (tight ? '\n' : '\n\n') + chunk
    lead = tight ? 1 : 2
  } else {
    const previous = before - 1
    const tightBefore = chunkIsList && listItem(previous)
    const tightAfter = chunkIsList && listItem(before)
    insertAt = offset(before)
    const head = previous >= 1 && !blank(previous) && !tightBefore ? '\n' : ''
    // A blank line already at the drop point keeps the next block apart.
    insert = head + chunk + '\n' + (tightAfter || blank(before) ? '' : '\n')
    lead = head.length
  }
  return {
    changes: [
      { from, to },
      { from: insertAt, insert },
    ],
    insertAt,
    lead,
  }
}
