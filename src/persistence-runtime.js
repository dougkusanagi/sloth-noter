import { createPersistence } from './persistence.js'
import { PERSISTENCE_INFO, createDesktopAdapter, desktopInvoke } from './persistence-desktop.js'
import { browserStorage, createWebAdapter } from './persistence-web.js'

/**
 * Chooses the persistence implementation for the environment: the native state
 * file inside the Tauri window, the browser storage everywhere else.
 */
export async function createAppPersistence(target = window, loadCore) {
  const invoke = await desktopInvoke(target, loadCore)
  if (!invoke) return createPersistence(createWebAdapter(browserStorage(target)))
  const adapter = createDesktopAdapter(invoke)
  let label = adapter.label
  try {
    const info = await invoke(PERSISTENCE_INFO)
    if (info?.statePath) label = info.statePath
  } catch { /* the default label is enough when the native side cannot answer */ }
  return createPersistence(adapter, label)
}
