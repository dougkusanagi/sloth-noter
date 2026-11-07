import test from 'node:test'
import assert from 'node:assert/strict'
import { accordionBlocks, remarkAccordions } from './accordions.js'
import { markdownTree } from './markdown-model.js'

const doc = '# Nota\n\n<details>\n<summary>Detalhes</summary>\n\nTexto **forte**\n\n</details>\n'

test('finds complete details blocks with exact title and source ranges', () => {
  const [block] = accordionBlocks(doc)
  assert.equal(doc.slice(block.titleFrom, block.titleTo), 'Detalhes')
  assert.equal(doc.slice(block.from, block.to), doc.slice(doc.indexOf('<details>')).trimEnd())
  assert.equal(block.title, 'Detalhes')
})

test('ignores examples in code, unfinished markup and nested blocks', () => {
  assert.equal(accordionBlocks('```\n' + doc + '```').length, 0)
  assert.equal(accordionBlocks(doc.replace('</details>', '')).length, 0)
  assert.equal(
    accordionBlocks(
      doc.replace('Texto **forte**', '<details>\n<summary>Outro</summary>\n\nTexto\n\n</details>'),
    ).length,
    1,
  )
})

test('mobile transformation preserves Markdown children', () => {
  const tree = markdownTree(doc)
  const fresh = structuredClone(tree)
  remarkAccordions()(fresh, { toString: () => doc })
  const details = fresh.children.find((node) => node.type === 'accordion')
  assert.equal(details.data.hName, 'details')
  assert.equal(details.children[0].data.hName, 'summary')
  assert.equal(details.children[1].children[1].type, 'strong')
})
