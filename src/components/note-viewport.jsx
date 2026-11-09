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
      if (view && saved?.anchor) {
        const block = view.lineBlockAt(Math.min(saved.anchor.from, view.state.doc.length))
        window.scrollBy(0, view.documentTop + block.top - saved.anchor.top)
      }
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
    let frame = saved
      ? requestAnimationFrame(() => {
          restoreScroll()
          frame = requestAnimationFrame(restoreScroll)
        })
      : null
    const capture = () => {
      const block = view?.state.selection.main.empty
        ? view.lineBlockAtHeight(
            Math.max(
              0,
              (document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0) -
                view.documentTop,
            ),
          )
        : null
      const position = {
        anchor: block ? { from: block.from, top: view.documentTop + block.top } : null,
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
      return position
    }
    let beforeTabClick = null
    const rememberBeforeBlur = (event) => {
      if (event.target.closest?.('.tab, .tab-close, .tab-new')) beforeTabClick = capture()
    }
    window.addEventListener('pointerdown', rememberBeforeBlur, true)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', rememberBeforeBlur, true)
      positions.set(key, beforeTabClick ?? capture())
    }
  }, [noteId, mode, positions, visualRef, editorRef])
  return children
}
