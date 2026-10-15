import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Brief measuring guides, shared by menu, settings and keyboard width adjustments. */
export function WidthFeedback({ width, mode }) {
  const anchor = useRef(null)
  const previous = useRef(width)
  const [visible, setVisible] = useState(false)
  const [bounds, setBounds] = useState(null)
  useEffect(() => {
    if (previous.current === width) return
    previous.current = width
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 1800)
    return () => clearTimeout(timer)
  }, [width])
  useLayoutEffect(() => {
    if (!visible) return
    const shell = anchor.current.closest('.editor-shell')
    const target = shell.querySelector('.cm-content, .reading, textarea')
    if (!target) {
      setBounds(null)
      return
    }
    const measure = () => {
      const rect = target.getBoundingClientRect()
      const style = getComputedStyle(target)
      const left = parseFloat(style.paddingLeft) || 0
      const right = parseFloat(style.paddingRight) || 0
      setBounds({ left: rect.left + left, width: rect.width - left - right })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(shell)
    observer.observe(target)
    measure()
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [visible, width, mode])
  return (
    <span ref={anchor} aria-hidden="true">
      {visible && bounds && (
        <span className="width-feedback" style={{ left: bounds.left, width: bounds.width }}>
          <span className="width-feedback-value">{Math.round(bounds.width)} px</span>
        </span>
      )}
    </span>
  )
}
