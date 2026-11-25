import { listIndentChanges } from '../list-indent.js'
import { blockEdit } from '../insert-block.js'
import { frontmatterEnd } from '../frontmatter.js'

const LIST_LINE = /^[ \t]*(?:[-*+]|\d+[.)])(?: |$)/
const NON_PARAGRAPH = /^[ \t]*(?:#{1,6} |>|\||```|~~~|<!--|---$|\*\*\*$)/

/**
 * Pure structural swipe gesture resolver for the mobile visual editor (B10).
 * Reuses `listIndentChanges` and `blockEdit` so gestures produce the exact same Markdown
 * and undo history as the formatting bar buttons:
 * - List item + swipe right -> indent
 * - List item + swipe left  -> outdent
 * - Plain paragraph + swipe right -> convert to task (`- [ ] `)
 * Returns an array of `{ from, to, insert }` changes, or `null` when nothing applies.
 */
export function structureSwipeEdit(text, pos, direction) {
  if (direction !== 'left' && direction !== 'right') return null
  if (typeof text !== 'string' || pos < 0 || pos > text.length) return null
  const fmEnd = frontmatterEnd(text)
  const titleEnd = text.indexOf('\n', fmEnd)
  if (pos <= (titleEnd < 0 ? text.length : titleEnd)) return null

  const lineStart = text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1
  const lineEndIdx = text.indexOf('\n', lineStart)
  const line = text.slice(lineStart, lineEndIdx < 0 ? text.length : lineEndIdx)

  if (LIST_LINE.test(line)) {
    const changes = listIndentChanges(text, lineStart, lineStart, direction === 'left')
    return changes && changes.length ? changes : null
  }
  if (direction === 'right' && line.trim() && !NON_PARAGRAPH.test(line)) {
    const edit = blockEdit(text, lineStart, lineStart, 'task')
    return edit ? [{ from: edit.from, to: edit.to, insert: edit.insert }] : null
  }
  return null
}

/** Classifies a touch gesture inside the editor as `'left'`, `'right'`, or `null`. */
export function classifyEditorSwipe({
  startX,
  startY,
  endX,
  endY,
  viewportWidth = 390,
  hasSelection = false,
}) {
  if (hasSelection) return null
  if (startX <= 24 || startX >= viewportWidth - 24) return null
  const dx = endX - startX
  const dy = endY - startY
  if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 2) return null
  return dx > 0 ? 'right' : 'left'
}
