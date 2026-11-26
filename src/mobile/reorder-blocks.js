import { ChangeSet, Text } from '@codemirror/state'
import { documentBlocks, moveBlockChanges } from '../block-move.js'

const COMMENT = /^\s*<!--.*-->\s*$/
const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX/!-])\]\s*/
const MARKERS = /^\s*(?:#{1,6}\s+|>\s*(?:\[![^\]]*\]\s*)?|(?:[-*+]|\d+[.)])\s+|```+\s*|~~~+\s*)/

/** A short, readable line for a block: its first line of text without Markdown markers. */
function blockLabel(lines, block) {
  const own = lines.slice(block.first - 1, block.last)
  const line = own.find((text) => text.trim() && !COMMENT.test(text)) ?? ''
  if (block.kind === 'table')
    return line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(' · ')
  let text = line
  for (let pass = 0; pass < 2; pass++) text = text.replace(MARKERS, '')
  return text.replace(/^\[[ xX/!-]\]\s*/, '').trim()
}

/**
 * The blocks of a note as the mobile reorder list shows them: the same blocks the desktop
 * handle moves (list items split, nested items stay with their parent, the title stays put).
 */
export function reorderItems(text) {
  const lines = text.split('\n')
  return documentBlocks(text).map((block) => {
    const first = lines.slice(block.first - 1, block.last).find((line) => !COMMENT.test(line))
    // Status boxes like `[/]` are tasks too, even where Markdown sees a plain list item.
    const box = ['task', 'list', 'numbered'].includes(block.kind)
      ? TASK.exec(first ?? '')?.[1]
      : null
    return {
      ...block,
      kind: box ? 'task' : block.kind,
      label: blockLabel(lines, block),
      lines: block.last - block.first + 1,
      done: box ? /[xX]/.test(box) : undefined,
    }
  })
}

/**
 * Moves the block at index `from` so it lands at index `to` among the blocks, and returns
 * the new text, or null when nothing moves.
 */
export function moveBlockTo(text, from, to) {
  const blocks = documentBlocks(text)
  const block = blocks[from]
  if (!block || to === from || to < 0 || to >= blocks.length) return null
  const count = text.split('\n').length
  const before = to < from ? blocks[to].first : (blocks[to + 1]?.first ?? count + 1)
  const result = moveBlockChanges(text, block.first, block.last, before)
  if (!result) return null
  return ChangeSet.of(result.changes, text.length)
    .apply(Text.of(text.split('\n')))
    .toString()
}
