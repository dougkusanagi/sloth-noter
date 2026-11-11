import { useEffect, useState } from 'react'
import { imeFromViewport, keyboardState } from './insets.js'

// Keeps --ime-bottom and data-keyboard current when the native shell does not report insets.
export function useInsets() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    function sync() {
      const ime = imeFromViewport({ innerHeight: window.innerHeight, viewport })
      window.__insetsFallback?.({ ime, keyboard: keyboardState(ime) })
    }
    sync()
    // Native insets may have arrived before the boot script was ready.
    window.SlothShare?.requestInsets?.()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
    }
  }, [])
}

// Reactive view of data-keyboard, kept current by native insets and the web fallback.
export function useKeyboardOpen() {
  const read = () => ['open', 'opening'].includes(document.documentElement.dataset.keyboard ?? '')
  const [open, setOpen] = useState(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setOpen(read()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-keyboard'],
    })
    return () => observer.disconnect()
  }, [])
  return open
}
