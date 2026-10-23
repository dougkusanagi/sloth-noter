import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { t } from '../i18n.js'

// Keep vertical scrolling native. Only a leftward, clearly horizontal gesture owns a row.
export function SwipeNoteRow({ children, enabled, onTrash }) {
  const gesture = useRef(null)
  const ignoreClick = useRef(false)
  const [distance, setDistance] = useState(0)
  const [tracking, setTracking] = useState(false)
  function cancel() {
    gesture.current = null
    setTracking(false)
    setDistance(0)
  }
  useEffect(() => {
    if (!tracking) return
    const reset = () => cancel()
    const preventHorizontalScroll = (event) => {
      if (gesture.current?.horizontal) event.preventDefault()
    }
    document.addEventListener('touchmove', preventHorizontalScroll, { passive: false })
    document.addEventListener('scroll', reset, true)
    window.addEventListener('blur', reset)
    return () => {
      document.removeEventListener('touchmove', preventHorizontalScroll)
      document.removeEventListener('scroll', reset, true)
      window.removeEventListener('blur', reset)
    }
  }, [tracking])
  return (
    <div
      className="mobile-swipe-row"
      data-swipe-ready={distance >= 88 || undefined}
      onPointerDownCapture={(event) => {
        cancel()
        ignoreClick.current = false
        if (
          !enabled ||
          !event.isPrimary ||
          event.button !== 0 ||
          !event.target.closest('.mobile-note-open')
        )
          return
        // Leave both edges to Android/browser back and forward gestures.
        if (event.clientX <= 24 || event.clientX >= window.innerWidth - 24) return
        setTracking(true)
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          horizontal: false,
        }
      }}
      onPointerMove={(event) => {
        const start = gesture.current
        if (!start || start.id !== event.pointerId || !enabled) {
          cancel()
          return
        }
        const dx = event.clientX - start.x
        const dy = event.clientY - start.y
        if (Math.abs(dy) > 24 && Math.abs(dy) >= Math.abs(dx) * 0.75) {
          ignoreClick.current = true
          cancel()
          return
        }
        if (!start.horizontal) {
          if (Math.abs(dy) > 10 || dx > 10) {
            cancel()
            return
          }
          if (dx >= -10) return
          if (Math.abs(dx) < Math.abs(dy) * 2) {
            cancel()
            return
          }
          start.horizontal = true
          if (event.isTrusted && event.pointerType === 'mouse')
            event.currentTarget.setPointerCapture(event.pointerId)
        }
        ignoreClick.current = true
        setDistance(Math.min(160, Math.max(0, -dx)))
      }}
      onPointerUp={(event) => {
        const start = gesture.current
        const remove =
          enabled &&
          start?.id === event.pointerId &&
          start.horizontal &&
          start.x - event.clientX >= 88
        cancel()
        if (remove) {
          // Let the browser finish pointer/click dispatch before removing the captured row.
          requestAnimationFrame(onTrash)
        }
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={(event) => {
        if (event.target === event.currentTarget) cancel()
      }}
      onClickCapture={(event) => {
        if (ignoreClick.current) {
          ignoreClick.current = false
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <div className="mobile-swipe-hint" aria-hidden="true" hidden={!distance}>
        <Trash2 size={22} />
        <span>{t('mobile.trash')}</span>
      </div>
      <div className="mobile-swipe-content" style={{ transform: `translateX(${-distance}px)` }}>
        {children}
      </div>
    </div>
  )
}
