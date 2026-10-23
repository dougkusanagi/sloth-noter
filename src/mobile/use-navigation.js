import { useEffect, useRef, useState } from 'react'
import { createNavigation, initialNavigation } from './nav-stack.js'

export function useNavigation(current) {
  const controller = useRef(null)
  const [state, setState] = useState(initialNavigation)
  useEffect(() => {
    let storage
    try {
      storage = window.sessionStorage
    } catch {
      /* storage can be disabled */
    }
    const nav = createNavigation({
      history: window.history,
      events: window,
      storage,
      noteExists: (id) => current.current.notes.some((note) => note.id === id),
      onChange: setState,
    })
    controller.current = nav
    setState(nav.getState())
    return () => {
      nav.dispose()
      controller.current = null
    }
  }, [current])
  return { state, dispatch: (action) => controller.current?.dispatch(action) }
}
