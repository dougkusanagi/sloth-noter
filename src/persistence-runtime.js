import { createPersistence } from './persistence.js'
import { PERSISTENCE_INFO, createDesktopAdapter, desktopInvoke } from './persistence-desktop.js'
import { VAULT_STATUS, createVaultAdapter } from './persistence-vault.js'
import { browserStorage, createWebAdapter } from './persistence-web.js'

/**
 * Chooses the persistence implementation for the environment: the native state
 * file inside the Tauri window, the browser storage everywhere else.
 */
export async function createAppPersistence(target = window, loadCore) {
  const invoke = await desktopInvoke(target, loadCore)
  if (!invoke) return createPersistence(createWebAdapter(browserStorage(target)))
  let status = { path: null, available: false }
  try {
    status = (await invoke(VAULT_STATUS)) ?? status
  } catch {
    /* without a vault answer the app keeps its own state file */
  }
  if (status.path && status.available) {
    const persistence = createPersistence(createVaultAdapter(invoke, status.path))
    return Object.assign(persistence, { invoke, vault: { path: status.path } })
  }
  const adapter = createDesktopAdapter(invoke)
  let label = adapter.label
  try {
    const info = await invoke(PERSISTENCE_INFO)
    if (info?.statePath) label = info.statePath
  } catch {
    /* the default label is enough when the native side cannot answer */
  }
  return Object.assign(createPersistence(adapter, label), {
    invoke,
    vault: null,
    vaultProblem: status.path ? `Notes folder not found: ${status.path}` : null,
  })
}
