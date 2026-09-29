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
  return {
    kind: 'desktop',
    label: 'the application data folder',
    async readState() {
      const contents = await invoke(READ_STATE)
      return typeof contents === 'string' ? contents : null
    },
    async readLegacy() {
      return null
    },
    async writeState(contents) {
      await invoke(WRITE_STATE, { contents })
    },
  }
}
