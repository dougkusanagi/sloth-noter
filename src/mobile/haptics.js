const PATTERNS = {
  threshold: 12,
  'task-done': 10,
  heading: 6,
}

/**
 * Triggers a short, meaningful haptic pulse at key interaction boundaries (B2):
 * - `'threshold'`: swipe-to-trash crossed the delete threshold
 * - `'task-done'`: a task was marked complete
 * - `'heading'`: heading scrub crossed a section heading
 *
 * Prefers the native Android `SlothSystem.haptic(kind)` bridge (which respects the system
 * vibration setting via `View.performHapticFeedback`), falling back to `navigator.vibrate`.
 */
export function triggerHaptic(
  kind,
  { system = globalThis.SlothSystem, nav = globalThis.navigator, win = globalThis.window } = {},
) {
  if (!PATTERNS[kind]) return false
  if (typeof system?.haptic === 'function') {
    try {
      system.haptic(kind)
      return true
    } catch {
      return false
    }
  }
  if (win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  if (typeof nav?.vibrate === 'function') {
    try {
      return Boolean(nav.vibrate(PATTERNS[kind]))
    } catch {
      return false
    }
  }
  return false
}
