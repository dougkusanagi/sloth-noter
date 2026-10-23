import { setLanguage } from '../i18n.js'

// Preferences live in the notes document, so a change is a normal commit (saved and undoable).
export function usePrefs({ data, current, commit }) {
  const prefs = data.preferences
  setLanguage(prefs.language)
  function updatePrefs(change) {
    commit({ ...current.current, preferences: { ...current.current.preferences, ...change } })
  }
  return { prefs, updatePrefs }
}
