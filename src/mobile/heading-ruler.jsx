import { useRef, useState } from 'react'
import { headingIndexForRatio } from './reading-zoom.js'
import { triggerHaptic } from './haptics.js'

/**
 * Floating heading ruler for long notes in reading mode (B11).
 * Positioned > 24 dp from the screen edge so Android's edge back gesture is never intercepted.
 * TalkBack users navigate via "Buscar e comandos" (`#`), so this scrub rail is visual-only.
 */
export function HeadingRuler({ headings, onJump }) {
  const rail = useRef(null)
  const lastIndex = useRef(-1)
  const [active, setActive] = useState(null)
  if (!headings || headings.length < 2) return null

  function scrub(clientY) {
    const rect = rail.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return
    const ratio = (clientY - rect.top) / rect.height
    const index = headingIndexForRatio(headings.length, ratio)
    if (index < 0) return
    const heading = headings[index]
    setActive(heading)
    if (index !== lastIndex.current) {
      lastIndex.current = index
      triggerHaptic('heading')
      onJump(heading)
    }
  }

  return (
    <div
      ref={rail}
      className="mobile-heading-ruler"
      aria-hidden="true"
      onPointerDown={(event) => {
        if (!event.isPrimary) return
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Ignore when pointer capture is unavailable.
        }
        scrub(event.clientY)
      }}
      onPointerMove={(event) => {
        if (lastIndex.current < 0 && !active) return
        scrub(event.clientY)
      }}
      onPointerUp={() => {
        lastIndex.current = -1
        setActive(null)
      }}
      onPointerCancel={() => {
        lastIndex.current = -1
        setActive(null)
      }}
    >
      <div className="mobile-heading-ruler-track">
        {headings.map((item) => (
          <span
            key={item.line}
            className="mobile-heading-ruler-tick"
            data-active={active?.line === item.line || undefined}
          />
        ))}
      </div>
      {active && <div className="mobile-heading-ruler-pill">{active.text}</div>}
    </div>
  )
}
