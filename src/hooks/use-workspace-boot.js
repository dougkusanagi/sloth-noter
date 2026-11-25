import { useCallback, useEffect, useState } from 'react'
import { createAppPersistence } from '../persistence-runtime.js'
import { openWorkspace } from '../boot.js'
import { friendlyError } from '../errors.js'

/**
 * Loads persistence and opens the workspace once, exposing retry/reload controls
 * shared by both desktop and mobile shells.
 */
export function useWorkspaceBoot() {
  const [started, setStarted] = useState(null)
  const [failure, setFailure] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    createAppPersistence()
      .then(async (persistence) => ({ persistence, loaded: await openWorkspace(persistence) }))
      .then((result) => {
        if (!cancelled) setStarted(result)
      })
      .catch((cause) => {
        if (!cancelled) setFailure(friendlyError(cause))
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setFailure(null)
    setAttempt((n) => n + 1)
  }, [])

  const reload = useCallback(() => {
    setStarted(null)
    setFailure(null)
    setAttempt((n) => n + 1)
  }, [])

  return { started, failure, retry, reload }
}
