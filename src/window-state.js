import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

const STORAGE_KEY = 'sloth-note:window-state'
const STATE_VERSION = 2
const MIN_WIDTH = 360
const MIN_HEIGHT = 420

function readState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (
      !value ||
      value.version !== STATE_VERSION ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      !Number.isFinite(value.width) ||
      !Number.isFinite(value.height) ||
      typeof value.maximized !== 'boolean'
    )
      return null
    return value
  } catch {
    return null
  }
}

function runningInTauri() {
  return (
    typeof window !== 'undefined' &&
    (isTauri() || typeof window.__TAURI_INTERNALS__?.invoke === 'function')
  )
}

export async function restoreWindowState() {
  if (!runningInTauri()) return () => {}
  const appWindow = getCurrentWindow()
  const saved = readState()
  let normal = saved
    ? {
        x: saved.x,
        y: saved.y,
        width: Math.max(MIN_WIDTH, saved.width),
        height: Math.max(MIN_HEIGHT, saved.height),
      }
    : null
  // The native window starts maximized. Keep saved normal bounds for persistence,
  // without resizing or maximizing the visible window after the webview loads.
  const save = async () => {
    try {
      // A minimized window can report zero size or an off-screen position.
      // Keep its last usable geometry for the next launch.
      if (await appWindow.isMinimized()) return
      const [position, size, maximized] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.innerSize(),
        appWindow.isMaximized(),
      ])
      if (!maximized && size.width >= MIN_WIDTH && size.height >= MIN_HEIGHT)
        normal = { x: position.x, y: position.y, width: size.width, height: size.height }
      if (normal)
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ version: STATE_VERSION, ...normal, maximized }),
        )
    } catch {
      // Saving the window geometry is best effort.
    }
  }
  // No onCloseRequested listener: Tauri then destroys the window from JS, which would
  // need an extra permission, and moves/resizes already keep the geometry saved.
  const registrations = await Promise.allSettled([
    appWindow.onMoved(save),
    appWindow.onResized(save),
  ])
  const unlisten = registrations
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
  return () =>
    unlisten.forEach((stop) => {
      try {
        stop()
      } catch {
        // The listener may already be gone when the window closes.
      }
    })
}
