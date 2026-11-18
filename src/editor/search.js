import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

export const setSearchHighlights = StateEffect.define()
export const searchHighlights = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (!effect.is(setSearchHighlights)) continue
      const { matches, index, scope } = effect.value
      value = Decoration.set(
        [
          ...(scope && scope.to > scope.from
            ? [Decoration.mark({ class: 'search-scope' }).range(scope.from, scope.to)]
            : []),
          ...matches
            .filter((match) => match.end > match.start)
            .map((match) =>
              Decoration.mark({
                class:
                  matches[index] === match ? 'search-match search-match-current' : 'search-match',
              }).range(match.start, match.end),
            ),
        ],
        true,
      )
    }
    return value
  },
  provide: (field) => EditorView.decorations.from(field),
})

let revealToken = 0

export function revealSearchMatch(view, match) {
  const token = ++revealToken
  view.dispatch({
    selection: { anchor: match.start, head: match.end },
    effects: EditorView.scrollIntoView(match.start, { y: 'center' }),
  })
  // CodeMirror scrolls its own viewport first with estimated heights; keep settling
  // across frames while newly measured blocks shift the match position.
  let settledOnce = false
  const step = (attempt) => {
    if (token !== revealToken || !view.dom.isConnected) return
    view.requestMeasure({
      key: 'reveal-search-match',
      read: () => {
        const mark = view.dom.querySelector('.search-match-current')
        return mark ? { mark, rect: mark.getBoundingClientRect() } : null
      },
      write: (found) => {
        if (token !== revealToken || !view.dom.isConnected) return
        if (!found) {
          if (attempt < 24) {
            queueMicrotask(() => {
              if (token !== revealToken || !view.dom.isConnected) return
              view.dispatch({ effects: EditorView.scrollIntoView(match.start, { y: 'center' }) })
              requestAnimationFrame(() => step(attempt + 1))
            })
          }
          return
        }
        const top =
          Math.max(
            document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0,
            document.querySelector('.find-dialog')?.getBoundingClientRect().bottom ?? 0,
          ) + 24
        const bottom = window.innerHeight - 48
        const { mark, rect } = found
        if (rect.top < top || rect.bottom > bottom) {
          settledOnce = false
          mark.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
          const after = mark.getBoundingClientRect()
          if (after.top < top) window.scrollBy({ top: after.top - top, behavior: 'instant' })
          else if (after.bottom > bottom)
            window.scrollBy({ top: after.bottom - bottom, behavior: 'instant' })
          if (attempt < 24) requestAnimationFrame(() => step(attempt + 1))
          return
        }
        if (!settledOnce && attempt < 24) {
          settledOnce = true
          requestAnimationFrame(() => step(attempt + 1))
        }
      },
    })
  }
  requestAnimationFrame(() => step(0))
}
