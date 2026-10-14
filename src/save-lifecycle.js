/** Finish queued saves before the desktop window is destroyed. */
export async function protectPendingSaves(
  writer,
  desktop,
  target = window,
  loadWindow = () => import('@tauri-apps/api/window'),
) {
  const flush = () => void writer.whenIdle()
  const onVisibility = () => {
    if (target.document.visibilityState === 'hidden') flush()
  }
  // Save when switching apps as well as when closing the native window.
  target.addEventListener('blur', flush)
  target.document.addEventListener('visibilitychange', onVisibility)
  let unlisten = () => {}
  const cleanup = () => {
    target.removeEventListener('blur', flush)
    target.document.removeEventListener('visibilitychange', onVisibility)
    unlisten()
  }
  try {
    if (desktop) {
      const appWindow = (await loadWindow()).getCurrentWindow()
      let closing = false
      unlisten = await appWindow.onCloseRequested(async (event) => {
        event.preventDefault()
        if (closing) return
        closing = true
        try {
          const failure = await writer.whenIdle()
          if (!failure) await appWindow.destroy()
        } finally {
          closing = false
        }
      })
    }
  } catch (cause) {
    cleanup()
    throw cause
  }
  return cleanup
}
