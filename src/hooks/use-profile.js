import { useEffect, useState } from 'react'

export const PROFILES_CHANGED = 'sloth-profiles-changed'

/**
 * The profile in use, for showing its name. Null on the web, while loading, or when there
 * is only one profile: then there is nothing to tell apart. Reloads after the profile list
 * changes in Settings.
 */
export function useActiveProfile(invoke, profileId) {
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    if (!invoke) return undefined
    let alive = true
    const load = () =>
      invoke('profiles_load')
        .then((catalog) => {
          if (!alive) return
          const current = catalog?.profiles?.find((item) => item.id === profileId)
          setProfile(catalog?.profiles?.length > 1 && current ? current : null)
        })
        .catch(() => alive && setProfile(null))
    load()
    window.addEventListener(PROFILES_CHANGED, load)
    return () => {
      alive = false
      window.removeEventListener(PROFILES_CHANGED, load)
    }
  }, [invoke, profileId])
  return profile
}
