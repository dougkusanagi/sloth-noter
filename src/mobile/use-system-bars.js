import { useEffect } from 'react'

// Tells the Android shell whether the app is dark, so status/navigation bar icons stay
// readable even when the app theme differs from the device theme. No-op elsewhere.
export function useSystemBars(env = window) {
  useEffect(() => {
    const root = env.document.documentElement
    const sync = () => env.SlothSystem?.setDarkBars?.(root.dataset.theme === 'dark')
    sync()
    const observer = new env.MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [env])
}
