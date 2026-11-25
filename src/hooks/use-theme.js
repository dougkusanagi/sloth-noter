import { useEffect } from 'react'

/**
 * Synchronizes `document.documentElement.dataset.theme` with the user's theme preference
 * and the OS color scheme when set to `'system'`.
 */
export function useTheme(theme) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
