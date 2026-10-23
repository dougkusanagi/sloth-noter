import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Shortcut, shortcutText } from './main-menu.jsx'

/** A selection-safe tooltip, also available when the button receives keyboard focus. */
export function ShortcutButton({ label, keys, children, ...props }) {
  const id = useId()
  const [position, setPosition] = useState(null)
  const closing = useRef(null)
  useEffect(() => () => clearTimeout(closing.current), [])
  function hide() {
    closing.current = setTimeout(() => setPosition(null), 100)
  }
  function show(event) {
    clearTimeout(closing.current)
    const rect = event.currentTarget.getBoundingClientRect()
    setPosition({
      left: Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2)),
      top: rect.top > 60 ? rect.top - 8 : rect.bottom + 8,
      transform: rect.top > 60 ? 'translate(-50%, -100%)' : 'translateX(-50%)',
    })
  }
  return (
    <>
      <button
        {...props}
        aria-label={label}
        aria-description={keys ? shortcutText(keys) : undefined}
        aria-describedby={position ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={() => setPosition(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && position) {
            event.stopPropagation()
            setPosition(null)
          }
        }}
      >
        {children}
      </button>
      {position &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="shortcut-tooltip"
            style={position}
            onMouseEnter={() => clearTimeout(closing.current)}
            onMouseLeave={hide}
          >
            <span>{label}</span>
            {keys && <Shortcut keys={keys} />}
          </span>,
          document.body,
        )}
    </>
  )
}
