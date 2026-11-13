import test from 'node:test'
import assert from 'node:assert/strict'
import { detailsBlocks, remarkDetails } from './details.js'
import { markdownTree } from './markdown-model.js'
import { EditorState } from '@codemirror/state'
import { foldField, foldableHeadings, foldRange, foldSection } from './editor/folding.js'

const text = '<details>\n<summary>Detalhes</summary>\n\nConteúdo\n\n</details>'

test('details use matching standalone HTML nodes and ignore fenced examples', () => {
  const [block] = detailsBlocks(text)
  assert.equal(block.summary, 'Detalhes')
  assert.equal(text.slice(block.contentFrom, block.contentTo).trim(), 'Conteúdo')
  assert.deepEqual(detailsBlocks('```html\n' + text + '\n```'), [])
  assert.deepEqual(detailsBlocks(text.replace('</details>', '')), [])
  assert.deepEqual(detailsBlocks(text.replace('<details>', '<details onclick="alert(1)">')), [])
  assert.equal(detailsBlocks(text.replace('Conteúdo', text)).length, 2)
})

test('details render through safe semantic nodes without enabling arbitrary HTML', () => {
  const tree = structuredClone(markdownTree(text.replace('Conteúdo', '<script>alert(1)</script>')))
  remarkDetails()(tree, text.replace('Conteúdo', '<script>alert(1)</script>'))
  const block = tree.children[0]
  assert.equal(block.data.hName, 'details')
  assert.equal(block.children[0].data.hName, 'summary')
  assert.equal(block.children[0].children[0].value, 'Detalhes')
  assert.equal(block.children[1].type, 'html', 'unsafe HTML is left for the reader to discard')
})

test('editing a details body preserves its fold anchored after the summary', () => {
  let state = EditorState.create({ doc: text, extensions: [foldField] })
  const range = foldRange(state, foldableHeadings(state)[0])
  state = state.update({ effects: foldSection.of(range) }).state
  state = state.update({ changes: { from: text.indexOf('Conteúdo'), insert: 'Mais ' } }).state
  assert.equal(state.field(foldField).size, 1)
})
