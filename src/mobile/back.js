import { backTarget } from './nav-stack.js'

// Android asks synchronously whether the event was handled; exit can wait for disk afterward.
export function createMobileBack({ getState, keyboardOpen, back, hideKeyboard, flush, finish }) {
  let exiting = false
  return () => {
    const target = backTarget(getState(), keyboardOpen())
    if (target === 'layer' || target === 'screen') back()
    else if (target === 'keyboard') hideKeyboard()
    else if (!exiting) {
      exiting = true
      Promise.resolve()
        .then(flush)
        .then((failure) => {
          if (!failure) finish()
        })
        .catch(() => {})
        .finally(() => {
          exiting = false
        })
    }
    return true
  }
}
