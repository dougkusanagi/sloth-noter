import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Shortcut, shortcutText } from './shortcut.jsx'

/** A selection-safe tooltip, also available when the button receives keyboard focus. */
export function ShortcutHint({ label, keys, children }) {
  const id = useId()
  const [position, setPosition] = useState(null)
  const tooltip = useRef(null)
  const target = useRef(null)
  const closing = useRef(null)
  useEffect(() => {
    const dismiss = () => setPosition(null)
    document.addEventListener('sloth:shortcut-tooltip', dismiss)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      clearTimeout(closing.current)
      document.removeEventListener('sloth:shortcut-tooltip', dismiss)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [])
  useLayoutEffect(() => {
    if (!position) return
    const rect = target.current.getBoundingClientRect()
    const { width, height } = tooltip.current.getBoundingClientRect()
    const left = Math.max(
      8,
      Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2),
    )
    const top = Math.max(
      8,
      Math.min(
        window.innerHeight - height - 8,
        rect.top >= height + 8 ? rect.top - height - 8 : rect.bottom + 8,
      ),
    )
    if (position.left !== left || position.top !== top) setPosition({ left, top })
  }, [position])
  function hide() {
    closing.current = setTimeout(() => setPosition(null), 100)
  }
  function show(event) {
    document.dispatchEvent(new Event('sloth:shortcut-tooltip'))
    clearTimeout(closing.current)
    target.current = event.currentTarget
    const rect = event.currentTarget.getBoundingClientRect()
    setPosition({ left: rect.left, top: rect.bottom + 8 })
  }
  const handlers = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: () => setPosition(null),
    onClick: () => setPosition(null),
    onKeyDown: (event) => {
      if (event.key === 'Escape' && position) {
        if (!event.currentTarget.closest('[role="menu"], [role="dialog"]')) event.stopPropagation()
        setPosition(null)
      }
    },
  }
  return (
    <>
      {cloneElement(children, {
        'aria-description': keys ? shortcutText(keys) : undefined,
        'aria-describedby': position ? id : undefined,
        ...Object.fromEntries(
          Object.entries(handlers).map(([name, handler]) => [
            name,
            (event) => {
              children.props[name]?.(event)
              if (!event.defaultPrevented) handler(event)
            },
          ]),
        ),
      })}
      {position &&
        createPortal(
          <span
            ref={tooltip}
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

export function ShortcutButton({ label, keys, children, ...props }) {
  return (
    <ShortcutHint label={label} keys={keys}>
      <button {...props} aria-label={label}>
        {children}
      </button>
    </ShortcutHint>
  )
}
