import { useEffect, useRef, useState } from 'react'
import { createNavigation, initialNavigation } from './nav-stack.js'
import { navigationStorage } from './navigation-storage.js'

export function useNavigation(current) {
  const controller = useRef(null)
  const [state, setState] = useState(initialNavigation)
  useEffect(() => {
    const storage = navigationStorage(window)
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
