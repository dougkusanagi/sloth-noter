import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { headingSections } from '../sections.js'
import { t } from '../i18n.js'

const chevron =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>'

/** Hides everything after a heading line up to `to`. `from` is the end of that line. */
export const foldSection = StateEffect.define({
  map: (value, mapping) => ({ from: mapping.mapPos(value.from), to: mapping.mapPos(value.to) }),
})
export const unfoldSection = StateEffect.define({
  map: (value, mapping) => ({ from: mapping.mapPos(value.from) }),
})

export class FoldToggleWidget extends WidgetType {
  constructor(line, folded) {
    super()
    this.line = line
    this.folded = folded
  }
  eq(other) {
    return this.line === other.line && this.folded === other.folded
  }
  toDOM(view) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `cm-fold-toggle${this.folded ? ' folded' : ''}`
    button.setAttribute('aria-label', t(this.folded ? 'fold.expand' : 'fold.collapse'))
    button.setAttribute('aria-expanded', String(!this.folded))
    button.innerHTML = chevron
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => toggleFold(view, this.line))
    return button
  }
  ignoreEvent() {
    return true
  }
}

/** The range a heading would hide, or null when its section has no content. */
export function foldRange(state, heading) {
  const doc = state.doc
  let last = Math.min(heading.end, doc.lines)
  while (last > heading.titleEnd && !doc.line(last).text.trim()) last--
  if (last <= heading.titleEnd) return null
  return { from: doc.line(heading.titleEnd).to, to: doc.line(last).to }
}

export function foldableHeadings(state) {
  return headingSections(state.doc.toString()).filter(
    (heading) => heading.level > 0 && foldRange(state, heading),
  )
}

function hasFold(folds, from) {
  let found = false
  folds.between(from, from, (start) => {
    if (start === from) found = true
  })
  return found
}

export const isFolded = (state, from) => hasFold(state.field(foldField), from)

export const foldField = StateField.define({
  create: () => Decoration.none,
  update(folds, transaction) {
    folds = folds.map(transaction.changes)
    const { state } = transaction
    if (transaction.docChanged && folds.size) {
      // Keep a fold only while its heading line is still a heading.
      const anchors = new Set(
        headingSections(state.doc.toString())
          .filter((heading) => heading.level > 0)
          .map((heading) => state.doc.line(heading.titleEnd).to),
      )
      folds = folds.update({ filter: (from) => anchors.has(from) })
    }
    for (const effect of transaction.effects) {
      if (effect.is(foldSection)) {
        const { from, to } = effect.value
        if (to > from && !hasFold(folds, from))
          folds = folds.update({ add: [Decoration.replace({}).range(from, to)] })
      } else if (effect.is(unfoldSection)) {
        folds = folds.update({ filter: (from) => from !== effect.value.from })
      }
    }
    if (transaction.selection && folds.size) {
      // Moving the cursor or selection into hidden text reveals it.
      const ranges = state.selection.ranges
      folds = folds.update({
        filter: (from, to) => !ranges.some((range) => range.to > from && range.from <= to),
      })
    }
    return folds
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** Folds or unfolds the section whose heading starts on `lineNumber`. */
export function toggleFold(view, lineNumber) {
  const { state } = view
  const heading = foldableHeadings(state).find((item) => item.line === lineNumber)
  if (!heading) return false
  const range = foldRange(state, heading)
  if (isFolded(state, range.from)) {
    view.dispatch({ effects: unfoldSection.of({ from: range.from }) })
  } else {
    const head = state.selection.main.head
    view.dispatch({
      effects: foldSection.of(range),
      // The caret cannot stay inside hidden text.
      ...(head > range.from && head <= range.to ? { selection: { anchor: range.from } } : {}),
    })
  }
  return true
}

export function foldAll(view) {
  const { state } = view
  const effects = foldableHeadings(state).map((heading) =>
    foldSection.of(foldRange(state, heading)),
  )
  if (!effects.length) return false
  const head = state.selection.main.head
  const hidden = effects.some(({ value }) => head > value.from && head <= value.to)
  view.dispatch({
    effects,
    ...(hidden
      ? {
          selection: {
            anchor: Math.min(
              ...effects
                .filter(({ value }) => head > value.from && head <= value.to)
                .map(({ value }) => value.from),
            ),
          },
        }
      : {}),
  })
  return true
}

export function unfoldAll(view) {
  const folded = []
  view.state.field(foldField).between(0, view.state.doc.length, (from) => {
    folded.push(unfoldSection.of({ from }))
  })
  if (!folded.length) return false
  view.dispatch({ effects: folded })
  return true
}
