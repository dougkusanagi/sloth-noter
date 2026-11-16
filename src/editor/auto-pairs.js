import { EditorSelection, StateEffect, StateField } from '@codemirror/state'
import { EditorView, ViewPlugin, keymap } from '@codemirror/view'

const addPair = StateEffect.define()
const pairPositions = StateField.define({
  create: () => [],
  update(positions, tr) {
    const next = positions
      .filter((pos) => {
        let deleted = false
        tr.changes.iterChangedRanges((from, to) => {
          if (from <= pos && to > pos) deleted = true
        })
        return !deleted
      })
      .map((pos) => tr.changes.mapPos(pos, 1))
    for (const effect of tr.effects) if (effect.is(addPair)) next.push(effect.value)
    return next
  },
})

const pairs = { '(': ')', '[': ']', '{': '}', '`': '`', '"': '"', "'": "'" }

export function pairInput(state, from, to, text) {
  if (state.readOnly || text.length !== 1) return null
  const selected = state.doc.sliceString(from, to)
  const before = state.doc.sliceString(Math.max(0, from - 2), from)
  const next = state.doc.sliceString(to, to + 1)
  const tracked = state.field(pairPositions, false)?.includes(to) ?? false
  const prefix = state.doc.sliceString(state.doc.lineAt(from).from, from)
  if (text === '`' && from === to && before === '``' && /^ {0,3}``$/.test(prefix) && next !== '`') {
    return { from, to, insert: '`\n\n```', anchor: from + 2 }
  }
  if (from === to && tracked && next === text && Object.values(pairs).includes(text)) {
    return { from, to, insert: '', anchor: from + 1 }
  }
  if (from === to && next === text) return null
  const close = pairs[text]
  if (!close) return null
  if (!selected && /[`"']/.test(text) && /[\p{L}\p{N}_]/u.test(before.slice(-1))) return null
  // Do not insert a closing delimiter in the middle of a word.
  if (!selected && /[\p{L}\p{N}_]/u.test(next)) return null
  return {
    from,
    to,
    insert: text + selected + close,
    anchor: from + 1,
    head: from + 1 + selected.length,
  }
}

// Only act after the composition has committed exactly one literal backtick.
export function committedBacktick(start, current, from, to) {
  const expected = start.doc.sliceString(0, from) + '`' + start.doc.sliceString(to)
  if (
    current.doc.toString() !== expected ||
    current.selection.main.from !== from + 1 ||
    !current.selection.main.empty
  )
    return null
  const result = pairInput(start, from, to, '`')
  if (!result) return null
  return { ...result, to: from + 1 }
}

function applyPair(view, result) {
  const { anchor, head = anchor, ...changes } = result
  const effects =
    changes.insert.length && changes.insert.endsWith(pairs[changes.insert[0]])
      ? addPair.of(changes.from + changes.insert.length - 1)
      : []
  view.dispatch({
    changes,
    effects,
    selection: EditorSelection.single(anchor, head),
    userEvent: 'input.type',
  })
}

const composedPairs = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view
      this.start = null
      this.frame = null
      this.begin = () => {
        cancelAnimationFrame(this.frame)
        const { from, to } = view.state.selection.main
        this.start = { state: view.state, from, to }
      }
      this.end = () => {
        // DOM mutations can follow compositionend; inspect after the browser flushes them.
        this.frame = requestAnimationFrame(() => {
          const start = this.start
          this.start = null
          if (!start || view.compositionStarted || view.state.readOnly) return
          const result = committedBacktick(start.state, view.state, start.from, start.to)
          if (result) applyPair(view, result)
        })
      }
      this.attachFrame = requestAnimationFrame(() => this.attach())
    }
    attach() {
      const context = this.view.contentDOM.editContext
      if (context === this.context) return
      this.detach()
      this.context = context
      context?.addEventListener('compositionstart', this.begin)
      context?.addEventListener('compositionend', this.end)
    }
    detach() {
      this.context?.removeEventListener('compositionstart', this.begin)
      this.context?.removeEventListener('compositionend', this.end)
    }
    update() {
      this.attach()
    }
    destroy() {
      cancelAnimationFrame(this.frame)
      cancelAnimationFrame(this.attachFrame)
      this.detach()
    }
  },
  {
    eventHandlers: {
      compositionstart() {
        this.begin()
      },
      compositionend() {
        this.end()
      },
    },
  },
)

export const autoPairs = [
  pairPositions,
  composedPairs,
  EditorView.inputHandler.of((view, from, to, text) => {
    // IMEs and dead keys may report a provisional accent before committing a character.
    if (view.composing || view.compositionStarted || view.state.selection.ranges.length !== 1)
      return false
    const result = pairInput(view.state, from, to, text)
    if (!result) return false
    applyPair(view, result)
    return true
  }),
  keymap.of([
    {
      key: 'Backspace',
      run(view) {
        if (view.composing || view.compositionStarted || view.state.selection.ranges.length !== 1)
          return false
        const { from, to } = view.state.selection.main
        if (from !== to || from === 0 || !view.state.field(pairPositions).includes(from))
          return false
        const open = view.state.doc.sliceString(from - 1, from)
        if (!pairs[open] || view.state.doc.sliceString(from, from + 1) !== pairs[open]) return false
        view.dispatch({ changes: { from: from - 1, to: from + 1 }, userEvent: 'delete.backward' })
        return true
      },
    },
  ]),
]
