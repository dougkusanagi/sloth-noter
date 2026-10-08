// Mouse selection paste is separate from keyboard/context-menu clipboard paste.
export function createMiddleClickPasteGuard() {
  let middlePaste = false
  return {
    mouse(event) {
      if (event.type === 'mousedown') {
        middlePaste =
          event.button === 1 &&
          !!event.target.closest?.('textarea, input, [contenteditable="true"], .cm-content') &&
          !event.target.closest?.('a[href]')
      }
      if (event.button === 1 && middlePaste) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    keyboard() {
      middlePaste = false
    },
    paste(event) {
      if (!middlePaste) return false
      event.preventDefault()
      event.stopPropagation()
      return true
    },
  }
}
