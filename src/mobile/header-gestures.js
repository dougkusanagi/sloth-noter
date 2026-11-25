/**
 * Pure gesture recognizer for the mobile header (B8 & B9):
 * - Pull down on header (`dy >= 44`, mostly vertical) -> `'commands'` (B8)
 * - Swipe horizontally on note title (`|dx| >= 48`, mostly horizontal, away from screen edges,
 *   and with no active text selection) -> `'prev'` or `'next'` open note (B9).
 */
export function classifyHeaderGesture({
  startX,
  startY,
  endX,
  endY,
  viewportWidth = 390,
  canSwitchNotes = false,
  hasSelection = false,
}) {
  const dx = endX - startX
  const dy = endY - startY
  if (dy >= 44 && dy > Math.abs(dx) * 1.5) return 'commands'
  if (
    canSwitchNotes &&
    !hasSelection &&
    startX > 24 &&
    startX < viewportWidth - 24 &&
    Math.abs(dx) >= 48 &&
    Math.abs(dx) > Math.abs(dy) * 1.5
  ) {
    return dx < 0 ? 'next' : 'prev'
  }
  return null
}

/** Adjacent open note ID for B9 deck swipe, or `null` if at the edge / fewer than 2 open notes. */
export function adjacentOpenNoteId(openIds, activeId, direction) {
  if (!Array.isArray(openIds) || openIds.length < 2) return null
  const index = openIds.indexOf(activeId)
  if (index < 0) return null
  const nextIndex = direction === 'next' ? index + 1 : index - 1
  return nextIndex >= 0 && nextIndex < openIds.length ? openIds[nextIndex] : null
}
