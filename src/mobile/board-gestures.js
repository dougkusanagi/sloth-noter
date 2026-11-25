/**
 * Pure gesture classifiers for the compact mobile TaskBoard (B15):
 * - Swiping a card horizontally past 72 px moves it to the adjacent column (`+1` or `-1`).
 * - Swiping the column background horizontally past 56 px switches the active column tab.
 * Both ignore edge swipes (<= 24 px from screen edges) to preserve Android's back gesture.
 */
export function classifyBoardCardSwipe({ startX, startY, endX, endY, viewportWidth = 390 }) {
  if (startX <= 24 || startX >= viewportWidth - 24) return 0
  const dx = endX - startX
  const dy = endY - startY
  if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.8) return 0
  return dx > 0 ? 1 : -1
}

export function classifyBoardColumnSwipe({ startX, startY, endX, endY, viewportWidth = 390 }) {
  if (startX <= 24 || startX >= viewportWidth - 24) return 0
  const dx = endX - startX
  const dy = endY - startY
  if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.8) return 0
  return dx < 0 ? 1 : -1
}

export function adjacentColumnIndex(count, current, delta) {
  if (count < 2 || !delta) return -1
  const next = current + delta
  return next >= 0 && next < count ? next : -1
}
