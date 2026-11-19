import { SHORTCUT_ACTIONS, keysFor, shortcutAction } from './shortcut-registry.js'

/** `[keys, label]` for every shortcut, with the user's choices; used by the shortcut list. */
export const shortcutList = () =>
  SHORTCUT_ACTIONS.flatMap((action) => keysFor(action.id).map((keys) => [keys, action.label]))

/** The default shortcuts, `[keys, label]`. */
export const SHORTCUTS = shortcutList()

/** The app action for a keydown (`newNote`, `tab3`, `larger`…), or null. */
export const appShortcut = (event) => shortcutAction(event, 'app')?.id ?? null
