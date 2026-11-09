import { backTarget } from './nav-stack.js'

// Android decides synchronously whether to show the predictive-back preview. The web shell
// reports this state ahead of time, so the callback is active only while it has something
// to close or an unsaved note it must protect.
export function backEnabled(state, { saving = false, error = null } = {}) {
  if (state.layers.length || state.screens.length > 1) return true
  return Boolean(saving || error)
}

// Android asks synchronously whether the event was handled; exit can wait for disk afterward.
export function createMobileBack({
  getState,
  keyboardOpen,
  pending = () => false,
  back,
  hideKeyboard,
  flush,
  finish,
  onPending = () => {},
  onFailed = () => {},
}) {
  let exiting = false
  return () => {
    const target = backTarget(getState(), keyboardOpen())
    if (target === 'layer' || target === 'screen') back()
    else if (target === 'keyboard') hideKeyboard()
    else if (!exiting) {
      exiting = true
      if (pending()) onPending()
      Promise.resolve()
        .then(flush)
        .then((failure) => {
          if (failure) onFailed()
          else finish()
        })
        .catch(() => {})
        .finally(() => {
          exiting = false
        })
    }
    return true
  }
}
