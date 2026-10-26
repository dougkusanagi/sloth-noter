import {
  externalSnapshot,
  externalsApi,
  pendingExternalWarning,
  readExternalNotes,
  writeExternalNotes,
} from './external-notes.js'

export const READ_STATE = 'read_state'
export const WRITE_STATE = 'write_state'
export const PERSISTENCE_INFO = 'persistence_info'

/**
 * Returns the Tauri IPC bridge only when the interface runs inside the native
 * window. A plain browser keeps the web adapter.
 */
export function tauriBridge(target = window) {
  return typeof target?.__TAURI_INTERNALS__?.invoke === 'function'
    ? target.__TAURI_INTERNALS__
    : null
}

export async function desktopInvoke(
  target = window,
  loadCore = () => import('@tauri-apps/api/core'),
) {
  if (!tauriBridge(target)) return null
  const { invoke } = await loadCore()
  return invoke
}

/**
 * Native state lives in the application data directory. The webview never
 * receives a filesystem handle: it can only call the commands below.
 */
export function createDesktopAdapter(invoke, history = null) {
  // Text last seen in each file opened in place; see external-notes.js.
  const seen = new Map()
  const paths = new Map()
  let saveIssue = null
  let readWarning = null
  return {
    clearSaveIssue() {
      saveIssue = null
    },
    get saveIssue() {
      return saveIssue
    },
    get readWarning() {
      return readWarning
    },
    kind: 'desktop',
    externals: externalsApi(invoke, seen),
    label: 'the application data folder',
    async readState() {
      saveIssue = null
      readWarning = null
      const contents = await invoke(READ_STATE)
      if (typeof contents !== 'string') return null
      let document
      try {
        document = JSON.parse(contents)
      } catch {
        return contents // a corrupt payload is reported and kept by the storage layer
      }
      if (!Array.isArray(document.notes)) return contents
      history?.setEnabled(document.preferences?.historyEnabled === true)
      const notes = await readExternalNotes(invoke, document.notes, seen, paths, history)
      const previous = { ...document, notes }
      readWarning = pendingExternalWarning(previous)
      if (readWarning) saveIssue = { kind: 'external', localSaved: true }
      history?.observe(previous, previous)
      return JSON.stringify(previous)
    },
    async readLegacy() {
      return null
    },
    async writeState(contents) {
      saveIssue = null
      const document = JSON.parse(contents)
      const snapshot = JSON.stringify(externalSnapshot(document, seen))
      // Preserve every local edit before touching files that can be unavailable.
      await invoke(WRITE_STATE, { contents: snapshot })
      const failures = await writeExternalNotes(invoke, document, seen, paths, {
        continueOnError: true,
      })
      const confirmed = JSON.stringify(externalSnapshot(document, seen))
      if (confirmed !== snapshot) await invoke(WRITE_STATE, { contents: confirmed })
      if (failures.length) {
        saveIssue = { kind: 'external', localSaved: true }
        throw new Error(failures.join('\n'))
      }
    },
  }
}
