import { rememberPasteGesture } from './paste-intent.js'
// Mouse selection paste is separate from keyboard/context-menu clipboard paste.
// Attach mouse handlers to the editor shell: padding can receive the click while
// the webview sends the resulting paste to the focused editable element.
export function createMiddleClickPasteGuard() {
  let middlePaste = false
  return {
    mouse(event) {
      if (event.type === 'mousedown') {
        middlePaste = event.button === 1 && !event.target.closest?.('a[href]')
      }
      if (event.button === 1 && middlePaste) {
        rememberPasteGesture('botao-meio')
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
