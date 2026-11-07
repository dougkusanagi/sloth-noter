import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { accordionBlocks } from '../accordions.js'
import { t } from '../i18n.js'

const toggleAccordion = StateEffect.define({ map: (value, changes) => changes.mapPos(value) })

class Toggle extends WidgetType {
  constructor(from, titleFrom, titleTo, end, folded) {
    super()
    Object.assign(this, { from, titleFrom, titleTo, end, folded })
  }
  eq(other) {
    return (
      this.from === other.from &&
      this.titleFrom === other.titleFrom &&
      this.titleTo === other.titleTo &&
      this.end === other.end &&
      this.folded === other.folded
    )
  }
  toDOM(view) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-accordion-toggle'
    button.setAttribute('aria-expanded', String(!this.folded))
    button.setAttribute('aria-label', t(this.folded ? 'accordion.expand' : 'accordion.collapse'))
    button.title = button.getAttribute('aria-label')
    button.innerHTML = this.folded
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      const selection = view.state.selection.main
      view.dispatch({
        effects: toggleAccordion.of(this.from),
        ...(!this.folded && selection.to > this.titleTo && selection.from <= this.end
          ? { selection: { anchor: this.titleTo } }
          : {}),
      })
    })
    return button
  }
  ignoreEvent() {
    return true
  }
}

function decorations(state, folded) {
  const ranges = []
  for (const block of accordionBlocks(state.doc.toString())) {
    const closed = folded.includes(block.from)
    ranges.push(Decoration.replace({}).range(block.from, block.titleFrom))
    ranges.push(
      Decoration.widget({
        widget: new Toggle(block.from, block.titleFrom, block.titleTo, block.to, closed),
        side: -1,
      }).range(block.titleFrom),
    )
    if (closed) {
      ranges.push(Decoration.replace({}).range(block.titleTo, block.to))
    } else {
      ranges.push(Decoration.replace({}).range(block.titleTo, block.bodyFrom))
      ranges.push(
        Decoration.replace({}).range(Math.max(block.bodyFrom, block.closeFrom - 1), block.to),
      )
    }
  }
  return Decoration.set(ranges, true)
}

export const accordionField = StateField.define({
  create: (state) => ({ folded: [], decorations: decorations(state, []) }),
  update(value, transaction) {
    let folded = transaction.docChanged
      ? value.folded.map((pos) => transaction.changes.mapPos(pos))
      : value.folded
    for (const effect of transaction.effects)
      if (effect.is(toggleAccordion))
        folded = folded.includes(effect.value)
          ? folded.filter((pos) => pos !== effect.value)
          : [...folded, effect.value]
    if (transaction.docChanged) {
      const anchors = new Set(
        accordionBlocks(transaction.state.doc.toString()).map((block) => block.from),
      )
      folded = folded.filter((pos) => anchors.has(pos))
    }
    if (transaction.selection && folded.length) {
      const blocks = accordionBlocks(transaction.state.doc.toString())
      folded = folded.filter((pos) => {
        const block = blocks.find((item) => item.from === pos)
        return (
          !block ||
          !transaction.state.selection.ranges.some(
            (range) => range.to > block.titleTo && range.from < block.to,
          )
        )
      })
    }
    if (!transaction.docChanged && !transaction.selection && folded === value.folded) return value
    return { folded, decorations: decorations(transaction.state, folded) }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})
