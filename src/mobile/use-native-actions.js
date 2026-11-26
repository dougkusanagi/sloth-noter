import { useEffect, useRef } from 'react'

// Runs actions that Android hands over once (launcher shortcut, shared text, pending quick
// notes). The native side keeps each item until the page takes/acks it, so it also works when
// the app was closed or resumed after creating a note on the lock screen.
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
      const opened = env.SlothSystem?.takeOpenedFile?.()
      if (opened && latest.current.openedFile) latest.current.openedFile(opened)
      const pending = env.SlothSystem?.takePendingNotes?.()
      const hasPending = Array.isArray(pending)
        ? pending.length > 0
        : typeof pending === 'string' && pending.trim() !== '' && pending.trim() !== '[]'
      if (hasPending && latest.current.pendingNotes) latest.current.pendingNotes(pending)
    }
    take()
    env.__nativeAction = take
    const onVisibility = () => {
      if (env.document?.visibilityState === 'visible') take()
    }
    env.document?.addEventListener?.('visibilitychange', onVisibility)
    return () => {
      env.document?.removeEventListener?.('visibilitychange', onVisibility)
      if (env.__nativeAction === take) delete env.__nativeAction
    }
  }, [ready, env])
}
