/** Finish queued saves before the desktop window is destroyed. */
export async function protectPendingSaves(
  writer,
  desktop,
  target = window,
  loadWindow = () => import('@tauri-apps/api/window'),
  { timeoutMs = 10000, onBlocked = () => {} } = {},
) {
  const flush = () => void writer.whenIdle().catch(() => {})
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
        let timer
        try {
          const failure = await Promise.race([
            writer.whenIdle(),
            new Promise((resolve) => {
              timer = setTimeout(() => resolve('timeout'), timeoutMs)
            }),
          ])
          clearTimeout(timer)
          if (!failure) await appWindow.destroy()
          else onBlocked({ reason: failure, forceClose: () => appWindow.destroy() })
        } catch (reason) {
          onBlocked({ reason, forceClose: () => appWindow.destroy() })
        } finally {
          clearTimeout(timer)
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
