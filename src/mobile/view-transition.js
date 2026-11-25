/**
 * Runs a mobile note open/close navigation inside the View Transitions API when supported
 * and when the user has not requested reduced motion (B1). Always falls back cleanly.
 */
export function runNoteTransition(
  run,
  { doc = globalThis.document, win = globalThis.window } = {},
) {
  const reduced = Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  if (!reduced && typeof doc?.startViewTransition === 'function') {
    try {
      doc.startViewTransition(() => run())
      return true
    } catch {
      run()
      return false
    }
  }
  run()
  return false
}
