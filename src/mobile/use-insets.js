import { useEffect } from 'react'
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
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
    }
  }, [])
}
