import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inlineColorChange, inlineColorRanges, blockColorMetadata } from './document-colors.js'
import { documentBlocks } from './block-move.js'
function apply(source, from, to, property, color) {
  const { changes } = inlineColorChange(source, from, to, property, color)
  return source.slice(0, changes.from) + changes.insert + source.slice(changes.to)
}
test('changing and resetting a partial color preserves the surrounding colors and text', () => {
  const source = '<span style="color:#e76565">abcdef</span>'
  const start = source.indexOf('abcdef')
  const changed = apply(source, start + 2, start + 4, 'color', 'blue')
  const parsed = inlineColorRanges(changed)
  assert.equal(parsed.ranges.length, 3)
  assert.equal(parsed.ranges.filter((r) => r.style.color === '#e76565').length, 2)
  const middle = changed.indexOf('cd')
  const reset = apply(changed, middle, middle + 2, 'reset')
  assert.match(reset, /<\/span>cd<span/)
})
test('background and text colors combine without nested wrappers', () => {
  const source = '<span style="color:#e76565">Text</span>'
  const start = source.indexOf('Text')
  const result = apply(source, start, start + 4, 'background', 'yellow')
  assert.match(result, /background-color:#fff4a3;color:#e76565/)
  assert.equal(inlineColorRanges(result).ranges.length, 1)
})
test('coloring multiple Markdown blocks preserves headings and list markers', () => {
  const source = '## Heading\n\n- Item\n- Other'
  const result = apply(source, 0, source.length, 'color', 'blue')
  assert.match(result, /^## <span/)
  assert.match(result, /\n- <span/)
  assert.doesNotMatch(result, /<span[^>]*>##/)
})
test('literal span source inside inline or fenced code is not interpreted as formatting', () => {
  assert.equal(inlineColorRanges('`<span style="color:#e76565">Text</span>`').ranges.length, 0)
  assert.equal(
    inlineColorRanges('```html\n<span style="color:#e76565">Text</span>\n```').ranges.length,
    0,
  )
})
test('block metadata follows headings, code, lists and paragraphs when moved', () => {
  for (const content of ['## Heading', '- Item', '```js\ncode\n```', 'Paragraph']) {
    const source = '# Note\n\n<!-- sloth:block background=green -->\n\n' + content
    const blocks = documentBlocks(source)
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].first, 3)
    assert.deepEqual(blockColorMetadata(source.split('\n')[2]), {
      color: undefined,
      background: 'green',
    })
  }
})

test('reading transformation keeps the metadata attached to one list item', async () => {
  const { applyDocumentColors } = await import('./document-colors.js')
  const { markdownTree } = await import('./markdown-model.js')
  const tree = applyDocumentColors(
    structuredClone(markdownTree('# Note\n\n<!-- sloth:block color=blue -->\n\n- One\n- Two')),
  )
  const list = tree.children.find((node) => node.type === 'list')
  assert.match(list.children[0].data.hProperties.style, /color:/)
  assert.equal(list.children[1].data, undefined)
})
