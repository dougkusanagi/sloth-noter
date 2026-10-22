const EDITOR = '.editor-shell .cm-content, .editor-shell textarea'

function stop(event) {
  event.preventDefault()
  event.stopPropagation()
  return true
}

// A focused editor is not permission to paste: WebKit can deliver populated
// clipboard events while opening/refocusing, without a mouse event in the page.
export function createPasteIntentGuard(now = Date.now) {
  let intent = null
  let input = null
  const internal = new WeakSet()
  const editor = (event) => event.target?.closest?.(EDITOR)
  const permit = (event, lifetime) => ({ editor: editor(event), until: now() + lifetime })
  const matches = (permission, event) =>
    permission?.editor && permission.editor === editor(event) && now() <= permission.until
  function reset() {
    intent = input = null
  }
  return {
    reset,
    keyboard(event) {
      reset()
      if (event.isComposing || event.altKey || !editor(event)) return
      if (
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') ||
        (event.shiftKey && !event.ctrlKey && !event.metaKey && event.key === 'Insert')
      )
        intent = permit(event, 1000)
    },
    contextMenu(event) {
      reset()
      if (editor(event)) intent = permit(event, 60_000)
    },
    paste(event) {
      const allowed = internal.has(event.nativeEvent ?? event) || matches(intent, event)
      reset()
      if (!editor(event)) return false
      if (!allowed) return stop(event)
      // Native textareas may insert via beforeinput after the paste event.
      input = permit(event, 1000)
      return false
    },
    beforeInput(event) {
      if (!event.inputType?.startsWith('insertFromPaste') || !editor(event)) return false
      const allowed = matches(input, event)
      reset()
      return allowed ? false : stop(event)
    },
    dispatchPaste(target, event) {
      // Only a completed, explicit native clipboard request uses this path.
      // Its async read may outlive the short keyboard permission above.
      internal.add(event)
      try {
        return target.dispatchEvent(event)
      } finally {
        internal.delete(event)
      }
    },
  }
}
