import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window'

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
  if (saved) {
    try {
      if (saved.maximized) await appWindow.maximize()
      else {
        await appWindow.setPosition(new PhysicalPosition(normal.x, normal.y))
        await appWindow.setSize(new PhysicalSize(normal.width, normal.height))
      }
    } catch {
      normal = null
    }
  }
  const save = async () => {
    try {
      const [position, size, maximized] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.innerSize(),
        appWindow.isMaximized(),
      ])
      if (!maximized)
        normal = { x: position.x, y: position.y, width: size.width, height: size.height }
      if (normal)
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ version: STATE_VERSION, ...normal, maximized }),
        )
    } catch {}
  }
  const registrations = await Promise.allSettled([
    appWindow.onMoved(save),
    appWindow.onResized(save),
    appWindow.onCloseRequested(save),
  ])
  const unlisten = registrations
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
  return () =>
    unlisten.forEach((stop) => {
      try {
        stop()
      } catch {}
    })
}
