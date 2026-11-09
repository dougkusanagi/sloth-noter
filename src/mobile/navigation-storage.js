import { NAV_SESSION_KEY } from './nav-stack.js'

// Keep only navigation metadata in durable storage. Migrate the older per-session snapshot once.
export function navigationStorage(target) {
  let local
  try {
    local = target.localStorage
    if (local.getItem(NAV_SESSION_KEY) === null) {
      const previous = target.sessionStorage?.getItem(NAV_SESSION_KEY)
      if (previous !== null && previous !== undefined) local.setItem(NAV_SESSION_KEY, previous)
    }
    return local
  } catch {
    try {
      return target.sessionStorage
    } catch {
      return undefined
    }
  }
}
