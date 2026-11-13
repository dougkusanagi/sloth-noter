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

export function revealSearchMatch(view, match) {
  view.dispatch({
    selection: { anchor: match.start, head: match.end },
    effects: EditorView.scrollIntoView(match.start, { y: 'center' }),
  })
  // CodeMirror scrolls its own viewport first. Then reveal the rendered mark
  // through every ancestor, including the outer page, after that layout pass.
  view.requestMeasure({
    read: () => view.dom.querySelector('.search-match-current'),
    write: (mark) => {
      if (!mark) return
      requestAnimationFrame(() => {
        if (!mark.isConnected) return
        mark.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        const top =
          Math.max(
            document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0,
            document.querySelector('.find-dialog')?.getBoundingClientRect().bottom ?? 0,
          ) + 24
        const rect = mark.getBoundingClientRect()
        if (rect.top < top) window.scrollBy({ top: rect.top - top, behavior: 'instant' })
      })
    },
  })
}
