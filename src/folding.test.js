import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import {
  foldField,
  foldRange,
  foldSection,
  foldableHeadings,
  isFolded,
  unfoldSection,
} from './editor/folding.js'

const DOC = '# T\n\n## A\ntexto a\n\n### B\ntexto b\n\n## C\n\n## D\ntexto d\n'
const make = (doc = DOC) => EditorState.create({ doc, extensions: [foldField] })
const ranges = (state) => {
  const found = []
  state.field(foldField).between(0, state.doc.length, (from, to) => found.push([from, to]))
  return found
}

test('foldable headings are the H2–H6 sections that have content', () => {
  const state = make()
  assert.deepEqual(
    foldableHeadings(state).map((heading) => heading.line),
    [3, 6, 11],
  )
  assert.equal(foldRange(make('# T\n\n## Vazio\n\n## Outro'), { titleEnd: 3, end: 4 }), null)
})

test('a fold hides from the end of the heading to the last non-blank line of its section', () => {
  const state = make()
  const [heading] = foldableHeadings(state)
  const range = foldRange(state, heading)
  assert.equal(state.sliceDoc(range.from, range.to), '\ntexto a\n\n### B\ntexto b')
  assert.equal(state.doc.lineAt(range.from).text, '## A')
})

test('folds and unfolds through effects and survive edits before them', () => {
  let state = make()
  const range = foldRange(state, foldableHeadings(state)[0])
  state = state.update({ effects: foldSection.of(range) }).state
  assert.equal(isFolded(state, range.from), true)
  assert.equal(ranges(state).length, 1)
  state = state.update({ changes: { from: 0, insert: 'xx' } }).state
  assert.deepEqual(ranges(state), [[range.from + 2, range.to + 2]])
  state = state.update({ effects: unfoldSection.of({ from: range.from + 2 }) }).state
  assert.equal(ranges(state).length, 0)
})

test('folding the same heading twice keeps one fold; nested folds can coexist', () => {
  let state = make()
  const [outer, inner] = foldableHeadings(state)
  state = state.update({
    effects: [foldSection.of(foldRange(state, inner)), foldSection.of(foldRange(state, inner))],
  }).state
  assert.equal(ranges(state).length, 1)
  state = state.update({ effects: foldSection.of(foldRange(state, outer)) }).state
  assert.equal(ranges(state).length, 2)
})

test('moving the cursor into hidden text reveals it, the heading line does not', () => {
  let state = make()
  const range = foldRange(state, foldableHeadings(state)[0])
  state = state.update({ effects: foldSection.of(range) }).state
  state = state.update({ selection: { anchor: range.from } }).state
  assert.equal(ranges(state).length, 1, 'cursor at the end of the heading stays folded')
  state = state.update({ selection: { anchor: range.from + 3 } }).state
  assert.equal(ranges(state).length, 0)
})

test('a fold is dropped when its heading stops being a foldable heading', () => {
  const plain = make('# T\n\n## A\ntexto')
  const fold = foldRange(plain, foldableHeadings(plain)[0])
  const folded = plain.update({ effects: foldSection.of(fold) }).state
  const renamed = folded.update({ changes: { from: 8, insert: 'b' } }).state
  assert.equal(ranges(renamed).length, 1, 'editing the title keeps the fold')
  const promoted = folded.update({ changes: { from: 5, to: 6, insert: '' } }).state // "# A"
  assert.equal(ranges(promoted).length, 0, 'an H1 is not foldable')
  const plainText = folded.update({ changes: { from: 5, to: 8, insert: '' } }).state // "A"
  assert.equal(ranges(plainText).length, 0)
})
