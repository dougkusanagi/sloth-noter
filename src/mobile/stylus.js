/**
 * Stylus handwriting helpers for Android WebView (B6).
 * Keeps pen strokes free for the system's Direct Stylus Handwriting-to-text conversion
 * without creating any custom drawing format.
 */

/** True when a PointerEvent originates from a stylus/pen. */
export function isStylusPointer(event) {
  return event?.pointerType === 'pen'
}

/** True when a TouchEvent contains a stylus touch point (WebKit/Chromium `touchType === 'stylus'`). */
export function isStylusTouch(event) {
  const list = event?.touches?.length ? event.touches : event?.changedTouches
  if (!list || list.length === 0) return false
  for (let i = 0; i < list.length; i += 1) {
    if (list[i]?.touchType === 'stylus') return true
  }
  return false
}

/**
 * Returns whether the current environment advertises native stylus handwriting support.
 * On Android 14+, `SlothSystem.isStylusHandwritingSupported()` reports true.
 */
export function isStylusHandwritingSupported(env = typeof window !== 'undefined' ? window : null) {
  if (!env) return false
  if (typeof env.SlothSystem?.isStylusHandwritingSupported === 'function') {
    return Boolean(env.SlothSystem.isStylusHandwritingSupported())
  }
  return typeof env.PointerEvent === 'function'
}
