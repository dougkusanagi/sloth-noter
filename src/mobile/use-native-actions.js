import { useEffect, useRef } from 'react'

// Runs actions that Android hands over once (launcher shortcut). The native side keeps
// the action until the page takes it, so it also works when the app was closed.
export function useNativeActions(handlers, ready, env = window) {
  const latest = useRef(handlers)
  latest.current = handlers
  useEffect(() => {
    if (!ready) return
    const take = () => {
      const action = env.SlothSystem?.takeAction?.()
      if (action === 'new-note') latest.current.newNote()
      const text = env.SlothSystem?.takeSharedText?.()
      if (text) latest.current.sharedText(text)
    }
    take()
    env.__nativeAction = take
    return () => {
      if (env.__nativeAction === take) delete env.__nativeAction
    }
  }, [ready, env])
}
