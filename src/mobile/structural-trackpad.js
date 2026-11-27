import { documentBlocks } from '../block-move.js'

function lineStarts(text) {
  const starts = [0]
  for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) starts.push(at + 1)
  return starts
}

/**
 * Returns the start offset of the previous (`direction < 0`) or next (`direction > 0`)
 * Markdown block relative to `pos` for the mobile structural trackpad (B14).
 * Returns `null` when already at the first/last block or when the document has no blocks.
 */
export function nextBlockCursor(text, pos, direction) {
  if (!text || (direction !== -1 && direction !== 1)) return null
  const rawBlocks = documentBlocks(text)
  if (!rawBlocks.length) return null
  const starts = lineStarts(text)
  const blocks = rawBlocks.map((block) => ({
    from: starts[block.first - 1] ?? 0,
    to: starts[block.last] !== undefined ? starts[block.last] - 1 : text.length,
  }))
  let current = blocks.findIndex((block) => pos >= block.from && pos <= block.to)
  if (current < 0) {
    current = blocks.findIndex((block) => block.from > pos)
    if (current < 0) current = blocks.length - 1
    else if (direction === 1) return blocks[current].from
    else current = Math.max(0, current - 1)
  }
  const target = current + direction
  if (target < 0 || target >= blocks.length) return null
  return blocks[target].from
}
