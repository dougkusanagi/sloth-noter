import { useLayoutEffect } from 'react'

/** Save before the outgoing editor leaves the DOM, while its scroll position is intact. */
export function NoteViewport({ noteId, mode, positions, visualRef, editorRef, children }) {
  useLayoutEffect(() => {
    const key = `${noteId}:${mode}`
    const saved = positions.get(key)
    const view = mode === 'visual' ? visualRef.current : null
    const field = mode === 'source' ? editorRef.current : null
    const scroller = view?.scrollDOM ?? field
    let disposed = false
    const restoreScroll = () => {
      if (disposed) return
      if (scroller) {
        scroller.scrollTop = saved?.top ?? 0
        scroller.scrollLeft = saved?.left ?? 0
      }
      window.scrollTo({
        top: saved?.windowTop ?? 0,
        left: saved?.windowLeft ?? 0,
        behavior: 'instant',
      })
    }
    if (view && saved?.selection) {
      const clamp = (position) => Math.min(view.state.doc.length, Math.max(2, position))
      view.dispatch({
        selection: { anchor: clamp(saved.selection.anchor), head: clamp(saved.selection.head) },
      })
    }
    if (field && saved?.selection) {
      const { start, end, direction } = saved.selection
      field.setSelectionRange(start, end, direction)
    }
    restoreScroll()
    // Let the editor's initial measurement and the restored selection statistics
    // settle before applying the saved scroll again. Keep this outside CM's measure loop.
    const frame = saved ? requestAnimationFrame(restoreScroll) : null
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      const position = {
        windowTop: window.scrollY,
        windowLeft: window.scrollX,
        top: scroller?.scrollTop ?? 0,
        left: scroller?.scrollLeft ?? 0,
        selection: view
          ? { anchor: view.state.selection.main.anchor, head: view.state.selection.main.head }
          : field
            ? {
                start: field.selectionStart,
                end: field.selectionEnd,
                direction: field.selectionDirection,
              }
            : null,
      }
      positions.set(key, position)
    }
  }, [noteId, mode, positions, visualRef, editorRef])
  return children
}
