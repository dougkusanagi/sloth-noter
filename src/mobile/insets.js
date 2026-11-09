// Keyboard height from the visual viewport, for WebViews that do not report IME insets.
export function imeFromViewport({ innerHeight, viewport }) {
  if (!viewport) return 0
  // Browser chrome, rounding and pinch zoom are not an on-screen keyboard.
  if (viewport.scale && Math.abs(viewport.scale - 1) > 0.01) return 0
  const covered = Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop))
  return covered >= 100 ? covered : 0
}

export function keyboardState(ime) {
  return ime > 0 ? 'open' : 'closed'
}
