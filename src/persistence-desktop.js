import { externalsApi, readExternalNotes, writeExternalNotes } from './external-notes.js'

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
export function createDesktopAdapter(invoke) {
  // Text last seen in each file opened in place; see external-notes.js.
  const seen = new Map()
  const paths = new Map()
  return {
    kind: 'desktop',
    externals: externalsApi(invoke, seen),
    label: 'the application data folder',
    async readState() {
      const contents = await invoke(READ_STATE)
      if (typeof contents !== 'string') return null
      let document
      try {
        document = JSON.parse(contents)
      } catch {
        return contents // a corrupt payload is reported and kept by the storage layer
      }
      if (!Array.isArray(document.notes)) return contents
      const notes = await readExternalNotes(invoke, document.notes, seen, paths)
      return JSON.stringify({ ...document, notes })
    },
    async readLegacy() {
      return null
    },
    async writeState(contents) {
      // Files first: if one refuses, the state keeps the text the file still has.
      await writeExternalNotes(invoke, JSON.parse(contents), seen, paths)
      await invoke(WRITE_STATE, { contents })
    },
  }
}
