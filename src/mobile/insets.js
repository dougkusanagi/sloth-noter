// Keyboard height from the visual viewport, for WebViews that do not report IME insets.
export function imeFromViewport({ innerHeight, viewport }) {
  if (!viewport) return 0
  return Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop))
}

export function keyboardState(ime) {
  return ime > 0 ? 'open' : 'closed'
}
