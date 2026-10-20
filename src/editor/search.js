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
  // The outer page scrolls too. Measure after Markdown and folds have reflowed.
  view.requestMeasure({
    read: () => view.coordsAtPos(match.start),
    write: (coords) => {
      if (!coords) return
      const top =
        Math.max(
          document.querySelector('.app-header')?.getBoundingClientRect().bottom ?? 0,
          document.querySelector('.find-dialog')?.getBoundingClientRect().bottom ?? 0,
        ) + 24
      const bottom = window.innerHeight - 70
      if (coords.top < top || coords.bottom > bottom)
        window.scrollBy({ top: coords.top - (top + bottom) / 2, behavior: 'instant' })
    },
  })
}
