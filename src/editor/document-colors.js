import { isolateHistory } from '@codemirror/commands'
import { Decoration, EditorView } from '@codemirror/view'
import { StateField } from '@codemirror/state'
import {
  inlineColorRanges,
  inlineColorChange,
  blockColorMetadata,
  blockColorStyle,
} from '../document-colors.js'
import { documentBlocks } from '../block-move.js'

function decorations(state) {
  const source = state.doc.toString(),
    marks = []
  const { ranges, tokens } = inlineColorRanges(source)
  for (const [from, to] of tokens) marks.push(Decoration.replace({}).range(from, to))
  for (const range of ranges)
    if (range.end > range.start)
      marks.push(
        Decoration.mark({
          attributes: {
            style: Object.entries(
              range.style['background-color'] && !range.style.color
                ? { ...range.style, color: '#23221e' }
                : range.style,
            )
              .map(([key, value]) => `${key}:${value}`)
              .join(';'),
          },
        }).range(range.start, range.end),
      )
  for (const block of documentBlocks(source)) {
    const metadata = blockColorMetadata(state.doc.line(block.first).text)
    if (!metadata) continue
    const first = block.first + 2
    if (first > block.last) continue
    marks.push(
      Decoration.line({ class: 'cm-color-metadata' }).range(state.doc.line(block.first).from),
    )
    marks.push(
      Decoration.line({ class: 'cm-color-metadata' }).range(state.doc.line(block.first + 1).from),
    )
    marks.push(
      Decoration.replace({}).range(
        state.doc.line(block.first).from,
        state.doc.line(block.first).to,
      ),
    )
    for (let line = first; line <= block.last; line++)
      marks.push(
        Decoration.line({
          class: `cm-colored-block${metadata.color ? ' cm-block-text-color' : ''}`,
          attributes: { style: blockColorStyle(metadata) },
        }).range(state.doc.line(line).from),
      )
  }
  return Decoration.set(marks, true)
}
export const documentColors = StateField.define({
  create: decorations,
  update: (value, tr) => (tr.docChanged ? decorations(tr.state) : value),
  provide: (field) => EditorView.decorations.from(field),
})

export function colorDocument(view, property, color) {
  if (!view || view.state.readOnly || view.state.selection.main.empty) return
  const { from, to } = view.state.selection.main
  view.dispatch({
    ...inlineColorChange(view.state.doc.toString(), from, to, property, color),
    userEvent: 'input.color',
    annotations: isolateHistory.of('full'),
  })
  view.focus()
}
export function colorBlock(view, block, property, color) {
  if (view.state.readOnly) return
  const doc = view.state.doc,
    line = doc.line(block.first)
  const current = blockColorMetadata(line.text)
  const value =
    property === 'reset'
      ? {}
      : { ...current, [property]: color === 'default' || color === 'none' ? undefined : color }
  const marker =
    value.color || value.background
      ? `<!-- sloth:block${value.color ? ` color=${value.color}` : ''}${value.background ? ` background=${value.background}` : ''} -->\n\n`
      : ''
  const to = current ? doc.line(block.first + 2).from : line.from
  view.dispatch({
    changes: { from: line.from, to, insert: marker },
    userEvent: 'input.color',
    annotations: isolateHistory.of('full'),
  })
  view.focus()
}
