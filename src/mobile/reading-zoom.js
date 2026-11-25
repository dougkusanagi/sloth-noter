export const READING_ZOOMS = ['full', 'outline', 'headings']

/** Steps the semantic reading zoom level (B12) in or out without breaking system zoom. */
export function stepReadingZoom(current, direction) {
  const index = Math.max(0, READING_ZOOMS.indexOf(current))
  if (direction === 'out') return READING_ZOOMS[Math.min(READING_ZOOMS.length - 1, index + 1)]
  if (direction === 'in') return READING_ZOOMS[Math.max(0, index - 1)]
  return READING_ZOOMS[(index + 1) % READING_ZOOMS.length]
}

/** Classifies a two-finger pinch ratio into `'in'`, `'out'`, or `null`. */
export function classifyPinch(startDistance, endDistance) {
  if (!Number.isFinite(startDistance) || startDistance < 20 || !Number.isFinite(endDistance))
    return null
  const ratio = endDistance / startDistance
  if (ratio <= 0.78) return 'out'
  if (ratio >= 1.28) return 'in'
  return null
}

/** Maps a 0..1 scrub ratio along the heading ruler (B11) to a heading index. */
export function headingIndexForRatio(count, ratio) {
  if (count <= 0) return -1
  const clamped = Math.max(0, Math.min(1, ratio))
  return Math.min(count - 1, Math.floor(clamped * count))
}
